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
from fastapi.responses import StreamingResponse

from config import settings
from services.assembly import decrypt_assembly_token

router = APIRouter()

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

    Uses the same name-matching logic as the VA sync job:
      Assembly client name ──(reverse overrides)──► Hubstaff project name

    Fast path: uses clientId from the token to call GET /clients/{id} (1 API call).
    Fallback: scans all Assembly clients for the matching companyId.
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
        raise HTTPException(status_code=400, detail="Token does not contain a companyId")

    if not settings.ASSEMBLY_API_KEY:
        raise HTTPException(status_code=503, detail="Assembly API not configured")

    # 2. Resolve Assembly client name for this company
    assembly_name: str | None = None

    if client_id:
        # Fast path: single Assembly client lookup
        import asyncio
        from services.assembly import get_assembly_client
        try:
            client_data = await asyncio.to_thread(
                get_assembly_client, settings.ASSEMBLY_API_KEY, client_id
            )
            given = (client_data.get("givenName") or "").strip()
            family = (client_data.get("familyName") or "").strip()
            full = f"{given} {family}".strip()
            if full:
                assembly_name = full
        except Exception:
            pass  # fall through to bulk lookup

    if not assembly_name:
        # Fallback: scan all Assembly clients for this companyId
        from services.assembly import get_all_assembly_clients
        try:
            all_clients = await get_all_assembly_clients(settings.ASSEMBLY_API_KEY)
            for c in all_clients:
                if c.get("companyId") == company_id:
                    given = (c.get("givenName") or "").strip()
                    family = (c.get("familyName") or "").strip()
                    full = f"{given} {family}".strip()
                    if full:
                        assembly_name = full
                        break
        except Exception:
            pass

    if not assembly_name:
        raise HTTPException(status_code=404, detail="No project found for this company")

    # 3. Reverse-map Assembly client name → Hubstaff project name
    #    (HUBSTAFF_TO_ASSEMBLY_NAME_OVERRIDES maps Hubstaff → Assembly, so we invert it)
    from scheduler import HUBSTAFF_TO_ASSEMBLY_NAME_OVERRIDES
    assembly_to_hubstaff = {v: k for k, v in HUBSTAFF_TO_ASSEMBLY_NAME_OVERRIDES.items()}
    hubstaff_project_name = assembly_to_hubstaff.get(assembly_name, assembly_name)

    # 4. Find the Hubstaff project by name
    from services.hubstaff_service import HubstaffService
    hubstaff = HubstaffService()
    org_id = settings.HUBSTAFF_ORG_ID
    try:
        projects = await hubstaff.get_projects(org_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Hubstaff projects: {e}")

    for p in projects:
        if p.get("name", "").strip().lower() == hubstaff_project_name.lower():
            return str(p["id"]), p["name"].strip()

    raise HTTPException(status_code=404, detail="No project found for this company")


# ---------------------------------------------------------------------------
# Hours endpoint
# ---------------------------------------------------------------------------

@router.get("/hours")
async def get_hours(token: str = Query(...)):
    """
    Return VA hours for today, this week, and the current billing period.
    Authenticated via Assembly iFrame token.
    """
    project_id, project_name = await get_hubstaff_project_for_token(token)

    from services.hubstaff_service import HubstaffService
    hubstaff = HubstaffService()
    org_id = settings.HUBSTAFF_ORG_ID

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

    return {
        "client_name": project_name,
        "today": build_block(
            today_totals,
            today.strftime("Today — %A, %B %-d"),
        ),
        "this_week": build_block(
            week_totals,
            f"This Week  (Mon {week_start.strftime('%b %-d')} – today)",
        ),
        "billing_period": build_block(
            period_totals,
            f"Billing Period  ({period_start.strftime('%b %-d')} – {period_end.strftime('%b %-d, %Y')})",
        ),
    }


# ---------------------------------------------------------------------------
# Invoices endpoint
# ---------------------------------------------------------------------------

@router.get("/invoices")
async def get_invoices(token: str = Query(...)):
    """
    Return all Hubstaff client invoices for this company, newest first.
    Authenticated via Assembly iFrame token.
    """
    project_id, project_name = await get_hubstaff_project_for_token(token)

    from services.hubstaff_service import HubstaffService
    hubstaff = HubstaffService()
    org_id = settings.HUBSTAFF_ORG_ID

    invoices = await hubstaff.get_invoices(
        organization_id=org_id,
        client_name=project_name,
        include_all_statuses=True,
    )

    # Sort newest first
    invoices.sort(key=lambda i: i.get("date") or i.get("created_at") or "", reverse=True)

    result = []
    for inv in invoices:
        line_items = [
            {
                "description": li.get("description") or li.get("project_name") or "—",
                "hours": round(float(li.get("hours") or li.get("duration", 0)) / 3600, 2)
                         if (li.get("hours") or li.get("duration")) else None,
                "amount": li.get("bill_amount") or li.get("amount"),
            }
            for li in (inv.get("line_items") or [])
        ]
        result.append({
            "id": str(inv.get("id", "")),
            "number": inv.get("number") or inv.get("invoice_number") or f"#{inv.get('id','')}",
            "status": inv.get("status", ""),
            "date": inv.get("date") or inv.get("created_at", ""),
            "due_date": inv.get("due_date"),
            "total": inv.get("bill_amount") or inv.get("amount") or inv.get("total"),
            "currency": inv.get("currency", "USD"),
            "line_items": line_items,
        })

    return {"client_name": project_name, "invoices": result}


# ---------------------------------------------------------------------------
# Invoice PDF proxy
# ---------------------------------------------------------------------------

@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(invoice_id: str, token: str = Query(...)):
    """
    Proxy the Hubstaff invoice PDF download.
    Authenticated via Assembly iFrame token.
    """
    # Verify token is valid (auth check) — project_id not needed for PDF proxy
    await get_hubstaff_project_for_token(token)

    from services.hubstaff_service import HubstaffService
    import httpx

    hubstaff = HubstaffService()
    org_id = settings.HUBSTAFF_ORG_ID

    pdf_url = (
        f"https://api.hubstaff.com/v2/organizations/{org_id}"
        f"/client_invoices/{invoice_id}/download"
    )

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as http:
        response = await http.get(pdf_url, headers=hubstaff.headers)
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Invoice PDF not found")
        if not response.is_success:
            raise HTTPException(status_code=502, detail="Failed to fetch PDF from Hubstaff")

        content_type = response.headers.get("content-type", "application/pdf")
        return StreamingResponse(
            iter([response.content]),
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="invoice-{invoice_id}.pdf"'
            },
        )
