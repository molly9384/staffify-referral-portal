"""
Assembly Hours Widget API.

Endpoints used by the standalone hours/invoices widget embedded in Assembly
as a Custom App. Authentication is via the Assembly iFrame token passed as
?token=... in the query string — no separate login required.

Billing period logic (separate from referral portal):
  - Anchor: April 10, 2026 (Friday)
  - Cycle: 14 days, Friday – Thursday
  - Weekly reset: Monday
"""

from datetime import date, timedelta
from fastapi import APIRouter, HTTPException, Query

import logging
from config import settings
from services.assembly import decrypt_assembly_token

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Billing / date helpers
# ---------------------------------------------------------------------------

BILLING_ANCHOR = date(2026, 4, 10)  # Friday — first day of billing period


def get_billing_period(today: date) -> tuple[date, date]:
    """Return (period_start, period_end) for the billing period containing today."""
    days_since = (today - BILLING_ANCHOR).days
    start = BILLING_ANCHOR + timedelta(days=(days_since // 14) * 14)
    end = start + timedelta(days=13)
    return start, end


def get_week_start(today: date) -> date:
    """Return the Monday of the current week."""
    return today - timedelta(days=today.weekday())


def format_seconds(seconds: float) -> str:
    """Format seconds as '6h 30m', '45m', or '0m'."""
    total_minutes = int(seconds // 60)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0:
        return f"{hours}h {minutes}m" if minutes > 0 else f"{hours}h"
    return f"{minutes}m"


# ---------------------------------------------------------------------------
# Token → Hubstaff project resolution
# ---------------------------------------------------------------------------

async def get_hubstaff_project_for_token(token: str) -> tuple[str, str]:
    """
    Decrypt Assembly iFrame token and resolve to the matching Hubstaff project.
    Returns (project_id, project_name).

    Resolution order (fastest → most expensive):
      1. DB lookup by assembly_company_id (populated by VA sync job — zero API calls)
      2. Single Assembly API call using clientId from token
      3. Full Assembly client scan (last resort — expensive, may trigger rate limits)
    """
    # 1. Decrypt token
    iframe_key = settings.ASSEMBLY_IFRAME_KEY or settings.ASSEMBLY_API_KEY
    if not iframe_key:
        raise HTTPException(status_code=503, detail="Assembly not configured")
    try:
        payload = decrypt_assembly_token(iframe_key, token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    company_id = payload.get("companyId")
    client_id = payload.get("clientId")

    if not company_id:
        raise HTTPException(status_code=404, detail="No project found for this company")

    if not settings.ASSEMBLY_API_KEY:
        raise HTTPException(status_code=503, detail="Assembly API not configured")

    # ── Fetch Hubstaff projects once (used by both DB and name-match paths) ──
    from database import AsyncSessionLocal
    from models import Client
    from sqlalchemy import select as sa_select
    from services.hubstaff_service import HubstaffService
    from scheduler import HUBSTAFF_TO_ASSEMBLY_NAME_OVERRIDES

    hubstaff = HubstaffService()
    org_id = settings.HUBSTAFF_ORG_ID

    try:
        projects = await hubstaff.get_projects(org_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Hubstaff projects: {e}")

    # ── Step A: DB fast path ────────────────────────────────────────────────
    # The VA sync job writes assembly_company_id → hubstaff_project_id on every
    # run.  Use that mapping directly so we never need to call Assembly's
    # /clients endpoint on a widget request.
    async with AsyncSessionLocal() as db:
        db_result = await db.execute(
            sa_select(Client).where(Client.assembly_company_id == company_id)
        )
        client_record = db_result.scalar_one_or_none()

    if client_record and client_record.hubstaff_project_id:
        project = next(
            (p for p in projects if str(p.get("id")) == str(client_record.hubstaff_project_id)),
            None,
        )
        if project:
            logger.debug(f"Widget DB hit: company {company_id} → project '{project['name']}'")
            return str(project["id"]), project["name"].strip()

    # ── Step B: Name-based matching (for new clients not yet in DB) ─────────

    assembly_to_hubstaff = {v: k for k, v in HUBSTAFF_TO_ASSEMBLY_NAME_OVERRIDES.items()}
    project_lookup = {p["name"].strip().lower(): p for p in projects if p.get("name")}

    def match_project(assembly_name: str):
        hubstaff_name = assembly_to_hubstaff.get(assembly_name, assembly_name)
        p = project_lookup.get(hubstaff_name.lower())
        if p:
            return str(p["id"]), p["name"].strip()
        return None

    # Step B1: single cheap call using clientId from the token
    # NOTE: We intentionally do NOT fall back to a full GET /clients scan here.
    # That bulk endpoint is rate-limited by Assembly and calling it on every
    # widget request caused persistent 429 errors.  The VA sync job populates
    # the DB mapping (Step A) via the bulk scan on its own schedule — once that
    # mapping exists all future widget requests use the fast DB path.
    import asyncio
    from services.assembly import get_assembly_client
    if client_id:
        try:
            client_data = await asyncio.to_thread(
                get_assembly_client, settings.ASSEMBLY_API_KEY, client_id
            )
            given = (client_data.get("givenName") or "").strip()
            family = (client_data.get("familyName") or "").strip()
            full = f"{given} {family}".strip()
            if full:
                result = match_project(full)
                if result:
                    await _write_back_company_id(company_id, result[0])
                    return result
        except Exception:
            pass

    # No match found — return 404 so the frontend shows the friendly empty state.
    # (The VA sync job will populate the DB mapping on its next successful run,
    # after which the DB fast path in Step A will resolve this company.)
    raise HTTPException(status_code=404, detail="No project found for this company")


async def _write_back_company_id(company_id: str, project_id: str) -> None:
    """
    When the widget resolves a project via name-matching fallback, write
    assembly_company_id back to the Client row so future requests hit the
    fast DB path instead of calling Assembly again.
    """
    try:
        from database import AsyncSessionLocal
        from models import Client
        from sqlalchemy import update as sa_update
        async with AsyncSessionLocal() as db:
            await db.execute(
                sa_update(Client)
                .where(Client.hubstaff_project_id == str(project_id))
                .values(assembly_company_id=company_id)
            )
            await db.commit()
        logger.info(f"Widget write-back: project {project_id} → company {company_id}")
    except Exception as e:
        logger.warning(f"Widget write-back failed (non-fatal): {e}")


# ---------------------------------------------------------------------------
# Hours endpoint
# ---------------------------------------------------------------------------

@router.get("/hours")
async def get_hours(token: str = Query(...), local_date: str = Query(None)):
    """
    Return VA hours for today, this week, and the current billing period.
    Authenticated via Assembly iFrame token.

    local_date (YYYY-MM-DD): the viewer's local calendar date, passed by the
    frontend to avoid UTC-vs-local-timezone drift on the server.
    """
    project_id, project_name = await get_hubstaff_project_for_token(token)

    from services.hubstaff_service import HubstaffService
    hubstaff = HubstaffService()
    org_id = settings.HUBSTAFF_ORG_ID

    # Use the client's local date when provided so a UTC server doesn't show
    # tomorrow's (empty) data to users in earlier time zones.
    if local_date:
        try:
            today = date.fromisoformat(local_date)
        except ValueError:
            today = date.today()
    else:
        today = date.today()
    week_start = get_week_start(today)
    period_start, period_end = get_billing_period(today)

    # Fetch project members for name lookup (role=user only)
    members = await hubstaff.get_project_members(project_id)
    user_names: dict[str, str] = {}
    for m in members:
        if m.get("membership_role") == "user":
            uid = str(m.get("user_id", ""))
            name = (m.get("user") or {}).get("name") or f"VA {uid}"
            if uid:
                user_names[uid] = name

    # Fetch all daily activities for the billing period (covers week and today too)
    fetch_start = min(week_start, period_start)
    activities = await hubstaff.get_activities(
        organization_id=org_id,
        project_id=project_id,
        start_date=fetch_start,
        end_date=today,
    )

    def aggregate(start: date, end: date) -> dict[str, float]:
        totals: dict[str, float] = {}
        for a in activities:
            try:
                act_date = date.fromisoformat(a.get("date", ""))
            except (ValueError, TypeError):
                continue
            if not (start <= act_date <= end):
                continue
            uid = str(a.get("user_id", ""))
            name = user_names.get(uid, f"VA {uid}")
            totals[name] = totals.get(name, 0) + float(a.get("tracked", 0))
        return totals

    def build_block(totals: dict[str, float], label: str) -> dict:
        total_secs = sum(totals.values())
        return {
            "label": label,
            "total_seconds": total_secs,
            "total_formatted": format_seconds(total_secs),
            "by_va": [
                {
                    "name": name,
                    "seconds": secs,
                    "formatted": format_seconds(secs),
                }
                for name, secs in sorted(totals.items())
            ],
        }

    today_totals = aggregate(today, today)
    week_totals = aggregate(week_start, today)
    period_totals = aggregate(period_start, today)

    # Build billing period block and add daily average
    billing_block = build_block(
        period_totals,
        f"Billing Period  ({period_start.strftime('%b %-d')} – {period_end.strftime('%b %-d, %Y')})",
    )
    days_elapsed = max((today - period_start).days + 1, 1)
    if billing_block["total_seconds"] > 0:
        billing_block["daily_avg_formatted"] = format_seconds(
            billing_block["total_seconds"] / days_elapsed
        )
    else:
        billing_block["daily_avg_formatted"] = None

    return {
        "client_name": project_name,
        "today": build_block(
            today_totals,
            today.strftime("Today (%A, %B %-d)"),
        ),
        "this_week": build_block(
            week_totals,
            f"This Week  (Mon {week_start.strftime('%b %-d')} – today)",
        ),
        "billing_period": billing_block,
    }


