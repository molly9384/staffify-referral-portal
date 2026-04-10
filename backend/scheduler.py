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

            # Step 3: Promote pending credits to eligible when Hubstaff invoice is paid
            promoted = await service.promote_eligible_credits()
            if promoted:
                logger.info(f"Promoted {promoted} credit(s) to eligible status.")

            # Step 4: Apply eligible credits to QBO invoices
            apply_result = await service.apply_pending_credits_to_invoices()
            logger.info(
                f"Credit application complete: applied={apply_result['applied']}, "
                f"total_applied=${apply_result['total_applied']:.2f}, "
                f"voided_excess=${apply_result.get('voided_excess', 0):.2f}"
            )

            await db.commit()
            logger.info("Bi-weekly credit automation job finished successfully.")

        except Exception as e:
            await db.rollback()
            logger.error(f"Bi-weekly credit automation job failed: {e}", exc_info=True)


def start_scheduler():
    """
    Register the bi-weekly job and start the APScheduler instance.
    Runs every other Friday at 7:00 AM Eastern, anchored to April 11 2026
    (the first billing Friday after go-live).
    """
    from datetime import datetime
    scheduler.add_job(
        run_biweekly_credit_job,
        trigger=CronTrigger(
            day_of_week="fri",
            hour=7,
            minute=0,
            week="*/2",
            start_date=datetime(2026, 4, 10, 7, 0, 0),
            timezone="America/New_York",
        ),
        id="biweekly_credit_job",
        name="Bi-Weekly Credit Calculation & QBO Application",
        replace_existing=True,
        misfire_grace_time=3600,  # 1 hour grace if Render restarts around run time
    )
    scheduler.start()
    logger.info("APScheduler started — bi-weekly credit job scheduled for every other Friday at 7 AM ET.")


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
