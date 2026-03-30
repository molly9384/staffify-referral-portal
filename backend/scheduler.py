"""
APScheduler bi-weekly job to calculate credits and apply them to QBO invoices.
This module is imported and started in main.py on application startup.
"""

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from database import AsyncSessionLocal

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def run_biweekly_credit_job():
    """
    Bi-weekly automation job:
    1. Calculate new credits for all active referrals from Hubstaff data.
    2. Check and expire any referrals whose 12-month window has elapsed.
    3. Apply pending credits as line items on referring clients' QBO invoices.
    """
    logger.info("Starting bi-weekly credit automation job...")
    async with AsyncSessionLocal() as db:
        try:
            from services.credit_service import CreditService
            service = CreditService(db)

            # Step 1: Check and expire referrals whose window has lapsed
            expired = await service.check_and_expire_referrals()
            if expired:
                logger.info(f"Marked {expired} referral(s) as expired.")

            # Step 2: Calculate new credits for all active referrals
            calc_result = await service.process_bi_weekly_credits()
            logger.info(
                f"Credit calculation complete: processed={calc_result['processed']}, "
                f"credits_created={calc_result['credits_created']}, "
                f"total_amount=${calc_result['total_amount']:.2f}"
            )

            # Step 3: Apply pending credits to QBO invoices
            apply_result = await service.apply_pending_credits_to_invoices()
            logger.info(
                f"Credit application complete: applied={apply_result['applied']}, "
                f"total_applied=${apply_result['total_applied']:.2f}"
            )

            await db.commit()
            logger.info("Bi-weekly credit automation job finished successfully.")

        except Exception as e:
            await db.rollback()
            logger.error(f"Bi-weekly credit automation job failed: {e}", exc_info=True)


def start_scheduler():
    """
    Register the bi-weekly job and start the APScheduler instance.
    Runs every 14 days at 6:00 AM on Monday (first occurrence after 14-day interval).
    In practice, on Render this will fire on the first Monday matching the cron
    every other week. Adjust as needed.
    """
    # Run every 14 days — APScheduler interval trigger
    scheduler.add_job(
        run_biweekly_credit_job,
        trigger="interval",
        weeks=2,
        id="biweekly_credit_job",
        name="Bi-Weekly Credit Calculation & QBO Application",
        replace_existing=True,
        misfire_grace_time=3600,  # 1 hour grace if missed
    )
    scheduler.start()
    logger.info("APScheduler started — bi-weekly credit job registered.")


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
