"""
APScheduler jobs for credit automation.

Three separate jobs:
  1. Friday 7:00 AM ET  (bi-weekly) — pull new credits from Hubstaff invoices
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
    """Friday 7:00 AM ET (bi-weekly) — expire old referrals + pull new pending credits from Hubstaff."""
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


def start_scheduler():
    """Register all three credit jobs and start the scheduler."""
    from datetime import datetime

    # Job 1: Pull credits — every other Friday at 7:00 AM ET
    scheduler.add_job(
        job_pull_credits,
        trigger=CronTrigger(
            day_of_week="fri",
            hour=7,
            minute=0,
            week="*/2",
            start_date=datetime(2026, 4, 11, 7, 0, 0),
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

    scheduler.start()
    logger.info(
        "APScheduler started — "
        "Pull: every other Friday 7:00 AM ET | "
        "Verify: every Wednesday 5:30 PM ET | "
        "Apply: every other Friday 2:30 PM ET"
    )


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
