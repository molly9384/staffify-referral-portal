from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from config import settings
from models import (
    Referral, VirtualAssistant, VAClockPeriod, CreditLedger,
    Client, ReferralStatus, CreditStatus
)

CREDIT_RATE = Decimal("1.00")  # $1.00 per hour worked


class CreditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_eligible_va(self, referral_id) -> Optional[VirtualAssistant]:
        """Get the currently eligible VA for a referral."""
        result = await self.db.execute(
            select(VirtualAssistant).where(
                VirtualAssistant.referral_id == referral_id,
                VirtualAssistant.is_eligible == True,
                VirtualAssistant.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_effective_months_elapsed(self, referral_id) -> float:
        """
        Calculate real months elapsed accounting for pauses.
        Sums all closed + open clock period durations.
        """
        result = await self.db.execute(
            select(VAClockPeriod).where(VAClockPeriod.referral_id == referral_id)
        )
        periods = result.scalars().all()
        total_days = 0
        today = date.today()
        for period in periods:
            end = period.period_end if period.period_end else today
            delta = (end - period.period_start).days
            if delta > 0:
                total_days += delta
        return total_days / 30.44  # average days per month

    async def get_effective_days_elapsed(self, referral_id) -> int:
        """Total active (non-paused) days elapsed for a referral."""
        result = await self.db.execute(
            select(VAClockPeriod).where(VAClockPeriod.referral_id == referral_id)
        )
        periods = result.scalars().all()
        total_days = 0
        today = date.today()
        for period in periods:
            end = period.period_end if period.period_end else today
            delta = (end - period.period_start).days
            if delta > 0:
                total_days += delta
        return total_days

    async def is_referral_eligible(self, referral_id) -> bool:
        """
        Check if a referral is currently eligible for credit accrual:
        - Referral must be active
        - Status must be 'active' or 'va_billing'
        - Within 12-month window (accounting for pauses)
        - Both referring and referred clients must be active
        - Must have an eligible VA
        """
        result = await self.db.execute(
            select(Referral)
            .where(Referral.id == referral_id)
            .options(
                selectinload(Referral.referring_client),
                selectinload(Referral.referred_client),
            )
        )
        referral = result.scalar_one_or_none()
        if not referral:
            return False
        if not referral.is_active:
            return False
        if referral.status not in (ReferralStatus.active, ReferralStatus.va_billing):
            return False
        if not referral.activation_date:
            return False

        # Check 12-month window
        effective_days = await self.get_effective_days_elapsed(referral_id)
        if effective_days >= 365:
            return False

        # Both clients must be active
        if not referral.referring_client or not referral.referring_client.is_active:
            return False
        if not referral.referred_client or not referral.referred_client.is_active:
            return False

        # Must have an eligible VA
        eligible_va = await self.get_eligible_va(referral_id)
        return eligible_va is not None

    async def calculate_credits_for_period(
        self,
        referral_id,
        period_start: date,
        period_end: date,
    ) -> Optional[Decimal]:
        """
        Calculate hours for the eligible VA in the given period from Hubstaff.
        Returns credit amount (hours * CREDIT_RATE) or None if not eligible.
        """
        is_eligible = await self.is_referral_eligible(referral_id)
        if not is_eligible:
            return None

        eligible_va = await self.get_eligible_va(referral_id)
        if not eligible_va or not eligible_va.hubstaff_user_id:
            return None

        # Get the referred client for their Hubstaff project
        referral_result = await self.db.execute(
            select(Referral)
            .where(Referral.id == referral_id)
            .options(selectinload(Referral.referred_client))
        )
        referral = referral_result.scalar_one_or_none()
        if not referral or not referral.referred_client:
            return None

        project_id = referral.referred_client.hubstaff_project_id
        if not project_id:
            return None

        from services.hubstaff_service import HubstaffService
        hubstaff = HubstaffService()
        total_seconds = await hubstaff.get_tracked_seconds_for_user(
            organization_id=settings.HUBSTAFF_ORG_ID,
            project_id=project_id,
            user_id=eligible_va.hubstaff_user_id,
            start_date=period_start,
            end_date=period_end,
        )

        hours_worked = Decimal(str(total_seconds / 3600)).quantize(Decimal("0.01"))
        credit_amount = (hours_worked * CREDIT_RATE).quantize(Decimal("0.01"))
        return credit_amount if hours_worked > 0 else None

    async def process_bi_weekly_credits(self) -> dict:
        """
        Main automation: for all active referrals, calculate credits for
        the most recent bi-weekly period and queue them for application.
        """
        today = date.today()
        # Bi-weekly period: last 14 days
        period_end = today - timedelta(days=1)
        period_start = today - timedelta(days=14)

        result = await self.db.execute(
            select(Referral).where(
                Referral.is_active == True,
                Referral.status.in_([ReferralStatus.active, ReferralStatus.va_billing]),
            ).options(
                selectinload(Referral.referring_client),
                selectinload(Referral.referred_client),
                selectinload(Referral.virtual_assistants),
            )
        )
        active_referrals = result.scalars().all()

        processed = 0
        credits_created = 0
        total_amount = Decimal("0.00")

        for referral in active_referrals:
            try:
                # Check if we already have a credit for this period
                existing_result = await self.db.execute(
                    select(CreditLedger).where(
                        CreditLedger.referral_id == referral.id,
                        CreditLedger.period_start == period_start,
                        CreditLedger.period_end == period_end,
                    )
                )
                if existing_result.scalar_one_or_none():
                    continue

                credit_amount = await self.calculate_credits_for_period(
                    referral.id, period_start, period_end
                )
                processed += 1

                if credit_amount and credit_amount > 0:
                    eligible_va = await self.get_eligible_va(referral.id)
                    hours_worked = credit_amount / CREDIT_RATE

                    credit_entry = CreditLedger(
                        referral_id=referral.id,
                        va_id=eligible_va.id,
                        period_start=period_start,
                        period_end=period_end,
                        hours_worked=hours_worked,
                        credit_amount=credit_amount,
                        status=CreditStatus.pending,
                    )
                    self.db.add(credit_entry)

                    # Update referral totals
                    referral.total_credits_earned = (
                        Decimal(str(referral.total_credits_earned)) + credit_amount
                    )

                    credits_created += 1
                    total_amount += credit_amount

            except Exception as e:
                # Log and continue; don't let one failure stop others
                print(f"Error processing referral {referral.id}: {e}")
                continue

        await self.db.flush()
        return {
            "processed": processed,
            "credits_created": credits_created,
            "total_amount": float(total_amount),
        }

    async def apply_pending_credits_to_invoices(self) -> dict:
        """
        Apply all pending credits to QBO invoices.
        Credits go to the referring client's next open invoice.
        Credit cannot exceed the invoice total.
        """
        from services.qbo_service import QBOService
        qbo = QBOService()

        if not qbo.is_connected():
            raise ValueError("QBO is not connected. Please authorize QuickBooks Online first.")

        result = await self.db.execute(
            select(CreditLedger)
            .where(CreditLedger.status == CreditStatus.pending)
            .options(
                selectinload(CreditLedger.referral).selectinload(Referral.referring_client)
            )
            .order_by(CreditLedger.period_start.asc())
        )
        pending_credits = result.scalars().all()

        applied = 0
        total_applied = Decimal("0.00")

        for credit in pending_credits:
            try:
                referring_client = credit.referral.referring_client
                if not referring_client or not referring_client.qbo_customer_id:
                    credit.notes = (
                        (credit.notes or "") + " [Skipped: no QBO customer ID on referring client]"
                    ).strip()
                    continue

                # Get open invoices for referring client
                open_invoices = await qbo.get_unpaid_invoices(referring_client.qbo_customer_id)
                if not open_invoices:
                    credit.notes = (
                        (credit.notes or "") + " [Skipped: no open invoice found for referring client]"
                    ).strip()
                    continue

                # Use the first (oldest) open invoice
                invoice = open_invoices[0]
                invoice_id = invoice.get("Id")
                invoice_balance = Decimal(str(invoice.get("Balance", 0)))

                if invoice_balance <= 0:
                    credit.notes = (
                        (credit.notes or "") + " [Skipped: invoice balance is zero]"
                    ).strip()
                    continue

                # Credit cannot exceed invoice total
                apply_amount = min(credit.credit_amount, invoice_balance)

                description = (
                    f"Staffify Referral Credit - {credit.referral.referred_name} "
                    f"({credit.period_start.strftime('%m/%d/%Y')} - {credit.period_end.strftime('%m/%d/%Y')})"
                )

                await qbo.apply_credit_to_invoice(invoice_id, float(apply_amount), description)

                credit.status = CreditStatus.applied
                credit.qbo_invoice_id = invoice_id
                credit.applied_date = date.today()
                credit.credit_amount = apply_amount

                # Update referral applied total
                referral_result = await self.db.execute(
                    select(Referral).where(Referral.id == credit.referral_id)
                )
                referral = referral_result.scalar_one_or_none()
                if referral:
                    referral.total_credits_applied = (
                        Decimal(str(referral.total_credits_applied)) + apply_amount
                    )

                applied += 1
                total_applied += apply_amount

            except Exception as e:
                credit.notes = ((credit.notes or "") + f" [Error: {str(e)}]").strip()
                print(f"Error applying credit {credit.id}: {e}")
                continue

        await self.db.flush()
        return {
            "applied": applied,
            "total_applied": float(total_applied),
        }

    async def check_and_expire_referrals(self) -> int:
        """
        Check all active referrals and mark expired ones.
        Called by scheduler.
        """
        result = await self.db.execute(
            select(Referral).where(
                Referral.is_active == True,
                Referral.activation_date != None,
            )
        )
        referrals = result.scalars().all()

        expired_count = 0
        for referral in referrals:
            effective_days = await self.get_effective_days_elapsed(referral.id)
            if effective_days >= 365 and referral.status not in (
                ReferralStatus.expired, ReferralStatus.ceased
            ):
                referral.status = ReferralStatus.expired
                referral.is_active = False
                expired_count += 1

        await self.db.flush()
        return expired_count
