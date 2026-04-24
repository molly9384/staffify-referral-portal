"""
APScheduler jobs for credit automation.

Three separate jobs:
  1. Friday 10:00 AM ET (bi-weekly) — pull new credits from Hubstaff invoices
  2. Wednesday 5:30 PM ET (weekly)  — verify pending credits, promote closed invoices to eligible
  3. Friday 2:30 PM ET  (bi-weekly) — apply eligible credits to QBO invoices
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from database import AsyncSessionLocal

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def job_pull_credits():
    """Friday 10:00 AM ET (bi-weekly) — expire old referrals + pull new pending credits from Hubstaff."""
    logger.info("Starting bi-weekly credit pull job...")
    async with AsyncSessionLocal() as db:
        try:
            from services.credit_service import CreditService
            service = CreditService(db)

            expired = await service.check_and_expire_referrals()
            if expired:
                logger.info(f"Marked {expired} referral(s) as expired.")

            calc = await service.process_bi_weekly_credits()
            logger.info(
                f"Credit pull complete: processed={calc['processed']}, "
                f"credits_created={calc['credits_created']}, "
                f"total_amount=${calc['total_amount']:.2f}"
            )

            await db.commit()
            logger.info("Credit pull job finished successfully.")
        except Exception as e:
            await db.rollback()
            logger.error(f"Credit pull job failed: {e}", exc_info=True)


async def job_verify_credits():
    """Wednesday 5:30 PM ET (weekly) — promote pending credits to eligible for closed Hubstaff invoices."""
    logger.info("Starting weekly credit verification job...")
    async with AsyncSessionLocal() as db:
        try:
            from services.credit_service import CreditService
            service = CreditService(db)

            promoted = await service.promote_eligible_credits()
            if promoted:
                logger.info(f"Promoted {promoted} credit(s) to eligible.")
            else:
                logger.info("No pending credits were ready to promote.")

            await db.commit()
            logger.info("Credit verification job finished successfully.")
        except Exception as e:
            await db.rollback()
            logger.error(f"Credit verification job failed: {e}", exc_info=True)


async def job_apply_credits():
    """Friday 2:30 PM ET (bi-weekly) — apply eligible credits to QBO invoices."""
    logger.info("Starting bi-weekly credit application job...")
    async with AsyncSessionLocal() as db:
        try:
            from services.credit_service import CreditService
            service = CreditService(db)

            apply = await service.apply_pending_credits_to_invoices()
            voided = apply.get('voided_excess', 0)
            logger.info(
                f"Credit application complete: applied={apply['applied']}, "
                f"total_applied=${apply['total_applied']:.2f}"
                + (f", voided_excess=${voided:.2f}" if voided else "")
            )

            await db.commit()
            logger.info("Credit application job finished successfully.")
        except Exception as e:
            await db.rollback()
            logger.error(f"Credit application job failed: {e}", exc_info=True)


# ---------------------------------------------------------------------------
# VA Sync configuration
# ---------------------------------------------------------------------------

# Hubstaff project name → Assembly client full name (for non-matching names)
HUBSTAFF_TO_ASSEMBLY_NAME_OVERRIDES = {
    "Flylisted": "Brianna Consoli",
    "PRSPCTV Media - Kyle Lux": "Kyle Lux",
}

# Hubstaff project names to skip entirely (case-insensitive)
SKIP_HUBSTAFF_PROJECTS = {"staffify", "patrick - hephaestus innovation"}

# Assembly client full names to skip entirely (case-insensitive)
SKIP_ASSEMBLY_CLIENTS = {"patrick szydlik"}


async def job_sync_vas():
    """Hourly — sync Hubstaff project VA assignments to Assembly company records.

    DB-first design: clients already mapped in the DB (assembly_company_id set)
    are updated with zero Assembly read-API calls.  Only clients not yet in the
    DB require a bulk GET /clients fetch, reducing Assembly rate-limit pressure.
    """
    logger.info("Starting VA sync job...")
    try:
        from services.hubstaff_service import HubstaffService
        from services.assembly import get_all_assembly_clients, update_company_vas
        from config import settings
        from database import AsyncSessionLocal
        from models import Client
        from sqlalchemy import select as sa_select, update as sa_update

        hubstaff = HubstaffService()
        org_id = settings.HUBSTAFF_ORG_ID
        api_key = settings.ASSEMBLY_API_KEY

        if not api_key:
            logger.warning("VA sync: ASSEMBLY_API_KEY not set — skipping.")
            return

        # ── Step 1: Get active Hubstaff projects ───────────────────────────
        projects = await hubstaff.get_projects(org_id)
        active_projects = [
            p for p in projects
            if p.get("status") == "active"
            and p.get("name", "").strip().lower() not in SKIP_HUBSTAFF_PROJECTS
        ]
        logger.info(f"VA sync: processing {len(active_projects)} active Hubstaff projects")

        # ── Step 2: Load existing DB mappings (assembly_company_id) ────────
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                sa_select(Client.hubstaff_project_id, Client.assembly_company_id)
                .where(Client.assembly_company_id.isnot(None))
            )
            db_mappings: dict[str, str] = {
                str(row.hubstaff_project_id): row.assembly_company_id
                for row in result.fetchall()
                if row.hubstaff_project_id
            }
        logger.info(f"VA sync: {len(db_mappings)} projects already mapped in DB")

        # Identify which projects still need Assembly name-matching
        unmapped_projects = [
            p for p in active_projects
            if str(p["id"]) not in db_mappings
        ]

        # ── Step 3: Fetch Assembly clients ONLY for unmapped projects ───────
        name_to_company_id: dict[str, str] = {}
        all_company_ids: set[str] = set()

        if unmapped_projects:
            logger.info(f"VA sync: {len(unmapped_projects)} projects need Assembly lookup")
            try:
                assembly_clients = await get_all_assembly_clients(api_key)
                for c in assembly_clients:
                    given = (c.get("givenName") or "").strip()
                    family = (c.get("familyName") or "").strip()
                    full_name = f"{given} {family}".strip()
                    company_id = c.get("companyId")
                    if not full_name or not company_id:
                        continue
                    if full_name.lower() in SKIP_ASSEMBLY_CLIENTS:
                        continue
                    name_to_company_id[full_name] = company_id
                    all_company_ids.add(company_id)
                logger.info(f"VA sync: loaded {len(name_to_company_id)} Assembly clients")
            except Exception as e:
                logger.warning(f"VA sync: Assembly client fetch failed ({e}) — will update DB-mapped clients only")
        else:
            logger.info("VA sync: all projects already in DB — skipping Assembly client fetch")

        # ── Step 4: Update each active project ────────────────────────────
        handled_company_ids: set[str] = set()

        for project in active_projects:
            project_name = project["name"].strip()
            project_id = str(project["id"])

            # Resolve company_id: DB first, then Assembly name-match
            company_id = db_mappings.get(project_id)
            if not company_id:
                assembly_name = HUBSTAFF_TO_ASSEMBLY_NAME_OVERRIDES.get(project_name, project_name)
                company_id = name_to_company_id.get(assembly_name)

            if not company_id:
                logger.warning(f"VA sync: no company_id for '{project_name}' — skipping")
                continue

            # Get VA members from Hubstaff
            try:
                members = await hubstaff.get_project_members(project["id"])
            except Exception as e:
                logger.error(f"VA sync: failed to fetch members for '{project_name}': {e}")
                continue

            va_names = [
                m["user"]["name"]
                for m in members
                if m.get("membership_role") == "user"
                and m.get("user", {}).get("name")
            ]
            va_value = ", ".join(va_names) if va_names else "*Sourcing Replacement*"

            try:
                await update_company_vas(api_key, company_id, va_value)
                handled_company_ids.add(company_id)
                logger.info(f"VA sync: '{project_name}' → '{va_value}'")
            except Exception as e:
                logger.error(f"VA sync: failed to update Assembly for '{project_name}': {e}")
                continue

            # Write company_id back to DB so future syncs skip the Assembly fetch
            if project_id not in db_mappings:
                try:
                    async with AsyncSessionLocal() as db:
                        await db.execute(
                            sa_update(Client)
                            .where(Client.hubstaff_project_id == project_id)
                            .values(assembly_company_id=company_id)
                        )
                        await db.commit()
                except Exception as e:
                    logger.warning(f"VA sync: could not write assembly_company_id for '{project_name}': {e}")

        # ── Step 5: Mark unmapped Assembly companies as sourcing ────────────
        # Only possible when we have the full Assembly client list
        if name_to_company_id:
            unhandled_company_ids = all_company_ids - handled_company_ids
            for company_id in unhandled_company_ids:
                try:
                    await update_company_vas(api_key, company_id, "*New Client - Sourcing*")
                    logger.info(f"VA sync: company {company_id} → '*New Client - Sourcing*'")
                except Exception as e:
                    logger.error(f"VA sync: failed to update company {company_id}: {e}")
        else:
            unhandled_company_ids = set()

        logger.info(
            f"VA sync finished — "
            f"updated: {len(handled_company_ids)}, "
            f"new client sourcing: {len(unhandled_company_ids)}"
        )

    except Exception as e:
        logger.error(f"VA sync job failed: {e}", exc_info=True)


def start_scheduler():
    """Register all three credit jobs and start the scheduler."""
    from datetime import datetime

    # Job 1: Pull credits — every other Friday at 10:00 AM ET
    scheduler.add_job(
        job_pull_credits,
        trigger=CronTrigger(
            day_of_week="fri",
            hour=10,
            minute=0,
            week="*/2",
            start_date=datetime(2026, 4, 11, 10, 0, 0),
            timezone="America/New_York",
        ),
        id="job_pull_credits",
        name="Bi-Weekly: Pull Credits from Hubstaff",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Job 2: Verify credits — every Wednesday at 5:30 PM ET
    scheduler.add_job(
        job_verify_credits,
        trigger=CronTrigger(
            day_of_week="wed",
            hour=17,
            minute=30,
            timezone="America/New_York",
        ),
        id="job_verify_credits",
        name="Weekly: Verify Credits (Promote Eligible)",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Job 3: Apply credits to QBO — every other Friday at 2:30 PM ET
    scheduler.add_job(
        job_apply_credits,
        trigger=CronTrigger(
            day_of_week="fri",
            hour=14,
            minute=30,
            week="*/2",
            start_date=datetime(2026, 4, 11, 14, 30, 0),
            timezone="America/New_York",
        ),
        id="job_apply_credits",
        name="Bi-Weekly: Apply Credits to QBO",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Job 4: Sync VA names to Assembly — every hour
    scheduler.add_job(
        job_sync_vas,
        trigger=CronTrigger(minute=0, timezone="America/New_York"),
        id="job_sync_vas",
        name="Hourly: Sync VA Names to Assembly",
        replace_existing=True,
        misfire_grace_time=300,
    )

    scheduler.start()
    logger.info(
        "APScheduler started — "
        "Pull: every other Friday 10:00 AM ET | "
        "Verify: every Wednesday 5:30 PM ET | "
        "Apply: every other Friday 2:30 PM ET | "
        "VA Sync: every 15 min"
    )


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
