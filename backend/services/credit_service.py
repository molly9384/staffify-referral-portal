from datetime import date
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

CREDIT_RATE = Decimal("1.00")  # $1.00 per hour worked by the eligible VA


def _parse_hours(item: dict) -> Decimal:
    """
    Extract decimal hours from a Hubstaff invoice line item.

    Auto-generated time-tracking items (generated=True) have quantity=1
    and store actual tracked seconds in generated_data.duration.
    Manual line items use quantity directly as hours.
    """
    try:
        if item.get("generated"):
            duration_seconds = item.get("generated_data", {}).get("duration", 0) or 0
            return (Decimal(str(duration_seconds)) / Decimal("3600")).quantize(Decimal("0.0001"))
        return Decimal(str(item.get("quantity", 0))).quantize(Decimal("0.0001"))
    except Exception:
        return Decimal("0")


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
        - Must be active with status active or va_billing
        - Within 12-month window (accounting for pauses)
        - Both referring and referred clients must be active
        - Must have an eligible VA with a Hubstaff username
        - Referred client must have a Hubstaff project linked
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
        if not referral or not referral.is_active:
            print(f"[DEBUG eligible] FAIL: referral missing or inactive")
            return False
        if referral.status not in (ReferralStatus.active, ReferralStatus.va_billing):
            print(f"[DEBUG eligible] FAIL: status={referral.status}")
            return False
        if not referral.activation_date:
            print(f"[DEBUG eligible] FAIL: no activation_date")
            return False

        effective_days = await self.get_effective_days_elapsed(referral_id)
        if effective_days >= 365:
            print(f"[DEBUG eligible] FAIL: 12-month window elapsed ({effective_days} days)")
            return False

        if not referral.referring_client or not referral.referring_client.is_active:
            print(f"[DEBUG eligible] FAIL: referring client missing or inactive")
            return False
        if not referral.referred_client or not referral.referred_client.is_active:
            print(f"[DEBUG eligible] FAIL: referred client missing or inactive")
            return False
        if not referral.referred_client.hubstaff_project_id:
            print(f"[DEBUG eligible] FAIL: no hubstaff_project_id on referred client")
            return False

        eligible_va = await self.get_eligible_va(referral_id)
        if not eligible_va or not eligible_va.hubstaff_user_name:
            print(f"[DEBUG eligible] FAIL: no eligible VA with hubstaff_user_name")
            return False
        print(f"[DEBUG eligible] PASS: eligible_va={eligible_va.hubstaff_user_name}")
        return True

    def calculate_credits_from_invoice(
        self, invoice: dict, va_name: str
    ) -> tuple[Decimal, Decimal]:
        """
        Parse Hubstaff invoice line items and sum hours for the eligible VA.

        Line item description format:
            "Liezl Lidasan - Vic Devore (Fri, Mar 13, 2026)"

        We match any line item whose description starts with "{va_name} - ".
        Returns (hours_worked, credit_amount).
        """
        line_items = invoice.get("line_items", [])
        total_hours = Decimal("0")

        prefix = va_name + " - "
        for item in line_items:
            description = item.get("description", "")
            if description.startswith(prefix):
                total_hours += _parse_hours(item)

        hours_worked = total_hours.quantize(Decimal("0.01"))
        credit_amount = (hours_worked * CREDIT_RATE).quantize(Decimal("0.01"))
        return hours_worked, credit_amount

    async def process_bi_weekly_credits(self) -> dict:
        """
        Main automation: pull Hubstaff invoices for every active referred client
        and create one pending CreditLedger entry per invoice (if not already processed).
        Run bi-weekly on Fridays.
        """
        from services.hubstaff_service import HubstaffService
        hubstaff = HubstaffService()

        result = await self.db.execute(
            select(Referral).where(
                Referral.is_active == True,
                Referral.status.in_([ReferralStatus.active, ReferralStatus.va_billing]),
                Referral.referred_client_id != None,
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
        errors = []
        # Track new credits per referring client for the statement email
        client_statement: dict = {}  # client_id → {name, credits[], total}

        for referral in active_referrals:
            try:
                print(f"[DEBUG credits] Checking referral {referral.id} ({referral.referred_name}), status={referral.status}, referred_client_id={referral.referred_client_id}")
                eligible = await self.is_referral_eligible(referral.id)
                print(f"[DEBUG credits] is_eligible={eligible}")
                if not eligible:
                    continue

                referred_client = referral.referred_client
                eligible_va = await self.get_eligible_va(referral.id)
                if not eligible_va:
                    continue

                # Fetch invoices from Hubstaff matched by client name
                invoices = await hubstaff.get_invoices(
                    organization_id=settings.HUBSTAFF_ORG_ID,
                    client_name=referred_client.name,
                )
                print(f"[DEBUG credits] Found {len(invoices)} invoices for client '{referred_client.name}'")
                for inv in invoices:
                    print(f"[DEBUG invoice] id={inv.get('id')} status={inv.get('status')} number={inv.get('number')} client={inv.get('client_name')} line_items={inv.get('line_items', [])}")

                for invoice in invoices:
                    invoice_id = str(invoice.get("id", ""))
                    if not invoice_id:
                        continue

                    # Skip if we already have a credit entry for this invoice
                    existing = await self.db.execute(
                        select(CreditLedger).where(
                            CreditLedger.hubstaff_invoice_id == invoice_id
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue

                    hours_worked, credit_amount = self.calculate_credits_from_invoice(
                        invoice, eligible_va.hubstaff_user_name
                    )

                    if credit_amount <= 0:
                        continue

                    # Use invoice_date as period_start; due_date or invoice_date as period_end
                    raw_start = invoice.get("invoice_date") or invoice.get("start_date") or str(date.today())
                    raw_end = invoice.get("due_date") or invoice.get("end_date") or raw_start
                    try:
                        period_start = date.fromisoformat(str(raw_start)[:10])
                        period_end = date.fromisoformat(str(raw_end)[:10])
                    except ValueError:
                        period_start = period_end = date.today()

                    credit_entry = CreditLedger(
                        referral_id=referral.id,
                        va_id=eligible_va.id,
                        period_start=period_start,
                        period_end=period_end,
                        hours_worked=hours_worked,
                        credit_amount=credit_amount,
                        status=CreditStatus.pending,
                        hubstaff_invoice_id=invoice_id,
                        hubstaff_invoice_number=invoice.get("number", ""),
                    )
                    self.db.add(credit_entry)

                    referral.total_credits_earned = (
                        Decimal(str(referral.total_credits_earned)) + credit_amount
                    )
                    credits_created += 1
                    total_amount += credit_amount

                    # Collect for statement email
                    cid = str(referral.referring_client_id)
                    if cid not in client_statement:
                        client_statement[cid] = {
                            "name": referral.referring_client.name if referral.referring_client else "",
                            "credits": [],
                            "total": Decimal("0.00"),
                        }
                    client_statement[cid]["credits"].append({
                        "referred_name": referral.referred_name or "—",
                        "period": f"{period_start.strftime('%b %-d')} – {period_end.strftime('%b %-d, %Y')}",
                        "amount": credit_amount,
                    })
                    client_statement[cid]["total"] += credit_amount

                processed += 1

            except Exception as e:
                msg = f"Referral {referral.id}: {e}"
                errors.append(msg)
                print(f"Error processing {msg}")
                continue

        await self.db.flush()

        # Send pending credits statement to each referring client
        if client_statement:
            try:
                from services.email_service import (
                    send_email, get_client_emails, email_pending_credits_statement,
                )
                import uuid as uuid_mod
                for cid, data in client_statement.items():
                    emails = await get_client_emails(self.db, uuid_mod.UUID(cid))
                    if emails:
                        subject, html = email_pending_credits_statement(
                            data["name"], data["credits"], data["total"]
                        )
                        await send_email(emails, subject, html)
                    # Assembly in-product notification
                    try:
                        from config import settings
                        from models import Client
                        from services.assembly import send_assembly_notification
                        from sqlalchemy import select as sa_select
                        client_result = await self.db.execute(sa_select(Client).where(Client.id == uuid_mod.UUID(cid)))
                        client = client_result.scalar_one_or_none()
                        if client and client.assembly_client_id and settings.ASSEMBLY_API_KEY:
                            total = data["total"]
                            send_assembly_notification(
                                settings.ASSEMBLY_API_KEY,
                                client.assembly_client_id,
                                title=f"You've earned ${total:.2f} in referral credits!",
                                body="Your pending credits have been updated. Check your Referral Rewards portal for details.",
                            )
                    except Exception as e:
                        print(f"[assembly] Pending credits notification failed: {e}")
            except Exception as e:
                print(f"[email] Pending credits statement failed: {e}")

        return {
            "processed": processed,
            "credits_created": credits_created,
            "total_amount": float(total_amount),
            "errors": errors,
        }

    async def recalculate_credit(self, credit_id) -> Optional[CreditLedger]:
        """
        Delete an existing credit entry and re-fetch the invoice from Hubstaff
        to recalculate. Used when an invoice has been manually adjusted.
        Returns the new CreditLedger entry, or None if no credits found.
        """
        from services.hubstaff_service import HubstaffService
        hubstaff = HubstaffService()

        result = await self.db.execute(
            select(CreditLedger)
            .where(CreditLedger.id == credit_id)
            .options(
                selectinload(CreditLedger.referral).selectinload(Referral.referred_client),
                selectinload(CreditLedger.va),
            )
        )
        credit = result.scalar_one_or_none()
        if not credit or not credit.hubstaff_invoice_id:
            return None

        # Re-fetch the invoice using the same client-filtered path as the main automation
        client_name = credit.referral.referred_client.name if credit.referral and credit.referral.referred_client else None
        invoice = {}
        if client_name:
            invoices = await hubstaff.get_invoices(
                organization_id=settings.HUBSTAFF_ORG_ID,
                client_name=client_name,
            )
            invoice = next((inv for inv in invoices if str(inv.get("id", "")) == str(credit.hubstaff_invoice_id)), {})
        va_name = credit.va.hubstaff_user_name
        hours_worked, credit_amount = self.calculate_credits_from_invoice(invoice, va_name)

        # Update the existing entry in place (preserves history)
        old_amount = Decimal(str(credit.credit_amount))
        credit.hours_worked = hours_worked
        credit.credit_amount = credit_amount
        credit.notes = (
            (credit.notes or "") + f" [Recalculated on {date.today()}]"
        ).strip()

        # Adjust referral totals
        referral_result = await self.db.execute(
            select(Referral).where(Referral.id == credit.referral_id)
        )
        referral = referral_result.scalar_one_or_none()
        if referral:
            referral.total_credits_earned = (
                Decimal(str(referral.total_credits_earned)) - old_amount + credit_amount
            )

        await self.db.flush()
        return credit

    async def promote_eligible_credits(self) -> int:
        """
        Check all pending credits and promote any whose Hubstaff invoice is now
        paid or closed to 'eligible' status.  Eligible credits will be applied
        to QBO invoices on the next billing cycle run.
        """
        from services.hubstaff_service import HubstaffService
        hubstaff = HubstaffService()

        result = await self.db.execute(
            select(CreditLedger)
            .where(
                CreditLedger.status == CreditStatus.pending,
                CreditLedger.hubstaff_invoice_id != None,
            )
            .options(
                selectinload(CreditLedger.referral).selectinload(Referral.referred_client)
            )
        )
        pending_credits = result.scalars().all()

        # Group by referred client to minimize Hubstaff API calls
        by_client: dict[str, list] = {}
        for credit in pending_credits:
            if credit.referral and credit.referral.referred_client:
                name = credit.referral.referred_client.name
                by_client.setdefault(name, []).append(credit)

        promoted = 0
        paid_statuses = {"paid", "closed", "approved"}

        for client_name, credits in by_client.items():
            try:
                invoices = await hubstaff.get_invoices(
                    organization_id=settings.HUBSTAFF_ORG_ID,
                    client_name=client_name,
                    include_all_statuses=True,
                )
                status_by_id = {str(inv.get("id", "")): (inv.get("status") or "").lower() for inv in invoices}
            except Exception as e:
                print(f"[DEBUG promote] error fetching invoices for '{client_name}': {e}")
                continue

            for credit in credits:
                inv_status = status_by_id.get(str(credit.hubstaff_invoice_id), "")
                if inv_status in paid_statuses:
                    credit.status = CreditStatus.eligible
                    promoted += 1
                    print(f"[DEBUG promote] credit {credit.id} invoice {credit.hubstaff_invoice_id} status={inv_status} → eligible")

        await self.db.flush()
        return promoted

    async def apply_pending_credits_to_invoices(self) -> dict:
        """
        Apply eligible credits to QBO invoices for the referring client.
        Rules:
        - Only one credit per referral per QBO invoice (no stacking same referral)
        - Multiple credits from different referrals for the same client CAN stack
        - Credits can never exceed the invoice balance; any excess is voided and
          total_credits_earned is adjusted down to reflect the true earned amount
        - Running invoice balance is tracked within the run so multiple credits
          applied to the same invoice in one pass never over-apply
        """
        from services.qbo_service import QBOService
        qbo = QBOService()

        if not qbo.is_connected():
            raise ValueError("QBO is not connected. Please authorize QuickBooks Online first.")

        result = await self.db.execute(
            select(CreditLedger)
            .where(CreditLedger.status == CreditStatus.eligible)
            .options(
                selectinload(CreditLedger.referral).selectinload(Referral.referring_client),
                selectinload(CreditLedger.va),
            )
            .order_by(CreditLedger.period_start.asc())
        )
        pending_credits = result.scalars().all()

        applied = 0
        skipped = 0
        voided_excess = Decimal("0.00")
        total_applied = Decimal("0.00")
        client_applied: dict = {}

        # Track remaining balance per QBO invoice within this run so that
        # multiple credits stacking on the same invoice don't over-apply
        invoice_balance_remaining: dict[str, Decimal] = {}

        for credit in pending_credits:
            try:
                referring_client = credit.referral.referring_client
                if not referring_client or not referring_client.qbo_customer_id:
                    credit.notes = (
                        (credit.notes or "") + " [Skipped: no QBO customer ID on referring client]"
                    ).strip()
                    skipped += 1
                    continue

                open_invoices = await qbo.get_unpaid_invoices(referring_client.qbo_customer_id)
                if not open_invoices:
                    credit.notes = (
                        (credit.notes or "") + " [Skipped: no open QBO invoice for referring client]"
                    ).strip()
                    skipped += 1
                    continue

                invoice_qbo = open_invoices[0]
                invoice_id = invoice_qbo.get("Id")

                # Initialise running balance for this invoice on first encounter
                if invoice_id not in invoice_balance_remaining:
                    invoice_balance_remaining[invoice_id] = Decimal(str(invoice_qbo.get("Balance", 0)))

                remaining_balance = invoice_balance_remaining[invoice_id]
                if remaining_balance <= 0:
                    credit.notes = (
                        (credit.notes or "") + " [Skipped: QBO invoice balance exhausted]"
                    ).strip()
                    skipped += 1
                    continue

                # Only one credit per referral ever — if any applied credit already
                # exists for this referral (on any invoice), void this one immediately.
                # Duplicate credits from the same referral are forfeited, not deferred.
                dup_check = await self.db.execute(
                    select(CreditLedger).where(
                        CreditLedger.referral_id == credit.referral_id,
                        CreditLedger.status == CreditStatus.applied,
                    )
                )
                if dup_check.scalar_one_or_none():
                    original_amount = Decimal(str(credit.credit_amount))
                    credit.status = CreditStatus.voided
                    credit.notes = (
                        (credit.notes or "") + " [Voided: only one credit per referral per billing cycle per program policy]"
                    ).strip()
                    voided_excess += original_amount
                    # Reduce total_credits_earned since this credit is forfeited
                    referral_result = await self.db.execute(
                        select(Referral).where(Referral.id == credit.referral_id)
                    )
                    referral = referral_result.scalar_one_or_none()
                    if referral:
                        referral.total_credits_earned = max(
                            Decimal("0"),
                            Decimal(str(referral.total_credits_earned)) - original_amount,
                        )
                    print(f"[DEBUG apply] credit {credit.id}: voided ${original_amount} — duplicate for referral {credit.referral_id}")
                    skipped += 1
                    continue

                original_amount = Decimal(str(credit.credit_amount))
                apply_amount = min(original_amount, remaining_balance)

                description = (
                    f"Staffify Referral Credit - {credit.referral.referred_name}"
                    + (f" | Invoice #{credit.hubstaff_invoice_number}" if credit.hubstaff_invoice_number else "")
                )
                await qbo.apply_credit_to_invoice(invoice_id, float(apply_amount), description)

                # Update credit record
                credit.status = CreditStatus.applied
                credit.qbo_invoice_id = invoice_id
                credit.applied_date = date.today()
                credit.credit_amount = apply_amount

                # Deduct from the running balance for this invoice
                invoice_balance_remaining[invoice_id] -= apply_amount

                # Fetch referral once to update both earned and applied totals
                referral_result = await self.db.execute(
                    select(Referral).where(Referral.id == credit.referral_id)
                )
                referral = referral_result.scalar_one_or_none()
                if referral:
                    excess = original_amount - apply_amount
                    if excess > 0:
                        # Void the excess: it never counts as earned per program policy
                        referral.total_credits_earned = max(
                            Decimal("0"),
                            Decimal(str(referral.total_credits_earned)) - excess,
                        )
                        credit.notes = (
                            (credit.notes or "")
                            + f" [${excess:.2f} voided — exceeded invoice balance per program policy]"
                        ).strip()
                        voided_excess += excess
                        print(f"[DEBUG apply] credit {credit.id}: capped ${original_amount} → ${apply_amount}, voided ${excess}")

                    referral.total_credits_applied = (
                        Decimal(str(referral.total_credits_applied)) + apply_amount
                    )

                applied += 1
                total_applied += apply_amount

                # Collect for applied statement email
                cid = str(credit.referral.referring_client_id)
                rc = credit.referral.referring_client
                if cid not in client_applied:
                    client_applied[cid] = {
                        "name": rc.name if rc else "",
                        "credits": [],
                        "total": Decimal("0.00"),
                    }
                period = ""
                if credit.period_start and credit.period_end:
                    period = f"{credit.period_start.strftime('%b %-d')} – {credit.period_end.strftime('%b %-d, %Y')}"
                client_applied[cid]["credits"].append({
                    "referred_name": credit.referral.referred_name or "—",
                    "period": period,
                    "amount": apply_amount,
                })
                client_applied[cid]["total"] += apply_amount

            except Exception as e:
                credit.notes = ((credit.notes or "") + f" [Error: {str(e)}]").strip()
                print(f"Error applying credit {credit.id}: {e}")
                continue

        await self.db.flush()

        # Send applied credits statement to each referring client
        if client_applied:
            try:
                from services.email_service import (
                    send_email, get_client_emails, email_applied_credits_statement,
                )
                import uuid as uuid_mod
                for cid, data in client_applied.items():
                    emails = await get_client_emails(self.db, uuid_mod.UUID(cid))
                    if emails:
                        subject, html = email_applied_credits_statement(
                            data["name"], data["credits"], data["total"]
                        )
                        await send_email(emails, subject, html)
                    # Assembly in-product notification
                    try:
                        from config import settings
                        from models import Client
                        from services.assembly import send_assembly_notification
                        from sqlalchemy import select as sa_select
                        client_result = await self.db.execute(sa_select(Client).where(Client.id == uuid_mod.UUID(cid)))
                        client = client_result.scalar_one_or_none()
                        if client and client.assembly_client_id and settings.ASSEMBLY_API_KEY:
                            total = data["total"]
                            send_assembly_notification(
                                settings.ASSEMBLY_API_KEY,
                                client.assembly_client_id,
                                title=f"${total:.2f} in credits applied to your invoice!",
                                body="Your referral credits have been applied to your latest Staffify invoice.",
                            )
                    except Exception as e:
                        print(f"[assembly] Applied credits notification failed: {e}")
            except Exception as e:
                print(f"[email] Applied credits statement failed: {e}")

        return {
            "applied": applied,
            "skipped": skipped,
            "voided_excess": float(voided_excess),
            "total_applied": float(total_applied),
        }

    async def check_and_expire_referrals(self) -> int:
        """Mark referrals as expired after 365 effective active days."""
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
