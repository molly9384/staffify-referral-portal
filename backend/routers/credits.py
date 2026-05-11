import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from auth import get_current_active_user, require_admin, require_admin_only, require_owner
from config import settings
from database import get_db
from models import CreditLedger, Referral, User, UserRole, CreditStatus
from schemas import CreditLedgerOut, CreditSummary, MessageResponse


class CreditUpdate(BaseModel):
    credit_amount: Optional[Decimal] = None
    notes: Optional[str] = None

router = APIRouter()


@router.get("", response_model=List[CreditLedgerOut])
async def list_credits(
    status_filter: Optional[str] = Query(None, alias="status"),
    referral_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = select(CreditLedger).options(selectinload(CreditLedger.referral))

    if current_user.role == UserRole.client:
        # Clients see credits for referrals they made
        client_referral_ids = select(Referral.id).where(
            Referral.referring_client_id == current_user.client_id
        )
        query = query.where(CreditLedger.referral_id.in_(client_referral_ids))

    if status_filter:
        try:
            status_enum = CreditStatus(status_filter)
            query = query.where(CreditLedger.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}")

    if referral_id:
        query = query.where(CreditLedger.referral_id == referral_id)

    query = query.order_by(CreditLedger.period_start.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/pending", response_model=List[CreditLedgerOut])
async def list_pending_credits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(CreditLedger)
        .where(CreditLedger.status == CreditStatus.pending)
        .options(selectinload(CreditLedger.referral))
        .order_by(CreditLedger.created_at.asc())
    )
    return result.scalars().all()


@router.get("/summary", response_model=CreditSummary)
async def get_credit_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    base_filter = []
    if current_user.role == UserRole.client:
        client_referral_ids = select(Referral.id).where(
            Referral.referring_client_id == current_user.client_id
        )
        base_filter.append(CreditLedger.referral_id.in_(client_referral_ids))

    pending_result = await db.execute(
        select(
            func.coalesce(func.sum(CreditLedger.credit_amount), 0),
            func.count(CreditLedger.id),
        ).where(*base_filter, CreditLedger.status == CreditStatus.pending)
    )
    pending_row = pending_result.one()

    eligible_result = await db.execute(
        select(
            func.coalesce(func.sum(CreditLedger.credit_amount), 0),
            func.count(CreditLedger.id),
        ).where(*base_filter, CreditLedger.status == CreditStatus.eligible)
    )
    eligible_row = eligible_result.one()

    applied_result = await db.execute(
        select(
            func.coalesce(func.sum(CreditLedger.credit_amount), 0),
            func.count(CreditLedger.id),
        ).where(*base_filter, CreditLedger.status == CreditStatus.applied)
    )
    applied_row = applied_result.one()

    total_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credit_amount), 0))
        .where(*base_filter, CreditLedger.status != CreditStatus.voided)
    )
    total_earned = total_result.scalar()

    # Current billing period start — bi-weekly anchor April 11 2026
    from datetime import date as date_type, timedelta
    anchor = date_type(2026, 4, 11)
    today = date_type.today()
    days_since = (today - anchor).days
    period_start = anchor + timedelta(days=(days_since // 14) * 14)

    period_applied_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credit_amount), 0))
        .where(
            *base_filter,
            CreditLedger.status == CreditStatus.applied,
            CreditLedger.applied_date >= period_start,
        )
    )
    period_applied = period_applied_result.scalar()

    return CreditSummary(
        total_pending=Decimal(str(pending_row[0])),
        total_eligible=Decimal(str(eligible_row[0])),
        total_applied=Decimal(str(applied_row[0])),
        total_earned=Decimal(str(total_earned)),
        pending_count=pending_row[1],
        eligible_count=eligible_row[1],
        applied_count=applied_row[1],
        period_applied=Decimal(str(period_applied)),
    )


@router.post("/pull-credits", response_model=MessageResponse)
async def pull_credits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    """Pull invoices from Hubstaff and create new pending credit entries."""
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        result = await service.process_bi_weekly_credits()
        return MessageResponse(
            message="Credits pulled successfully",
            detail=f"Processed {result['processed']} referrals, created {result['credits_created']} credit entries totaling ${result['total_amount']:.2f}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pull credits failed: {str(e)}")


@router.post("/verify-credits", response_model=MessageResponse)
async def verify_credits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    """Check all pending credits against Hubstaff and promote any with closed invoices to eligible."""
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        promoted = await service.promote_eligible_credits()
        return MessageResponse(
            message="Credits verified successfully",
            detail=f"Promoted {promoted} pending credit(s) to eligible (Credits Next Invoice)",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verify credits failed: {str(e)}")


def _check_cron_secret(request: Request):
    if not settings.CRON_SECRET:
        raise HTTPException(status_code=503, detail="Cron trigger not configured (CRON_SECRET not set)")
    incoming = request.headers.get("X-Cron-Secret", "")
    if not incoming or incoming != settings.CRON_SECRET:
        raise HTTPException(status_code=403, detail="Invalid or missing cron secret")


@router.post("/cron-pull", response_model=MessageResponse)
async def cron_pull(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Cron endpoint — Friday 7:00 AM ET (every other week).
    Expires old referrals and pulls new pending credits from Hubstaff invoices.
    """
    _check_cron_secret(request)
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        expired = await service.check_and_expire_referrals()
        calc = await service.process_bi_weekly_credits()
        await db.commit()
        return MessageResponse(
            message="Credit pull completed",
            detail=f"Expired: {expired} referrals | Credits created: {calc['credits_created']} (${calc['total_amount']:.2f})",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cron pull failed: {str(e)}")


@router.post("/cron-verify", response_model=MessageResponse)
async def cron_verify(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Cron endpoint — Wednesday 5:30 PM ET (every week).
    Checks all pending credits and promotes any with closed Hubstaff invoices to eligible.
    """
    _check_cron_secret(request)
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        promoted = await service.promote_eligible_credits()
        await db.commit()
        return MessageResponse(
            message="Credit verification completed",
            detail=f"Promoted {promoted} pending credit(s) to eligible",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cron verify failed: {str(e)}")


@router.post("/cron-apply", response_model=MessageResponse)
async def cron_apply(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Cron endpoint — Friday 2:30 PM ET (every other week).
    Applies all eligible credits to QBO invoices.
    """
    _check_cron_secret(request)
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        apply = await service.apply_pending_credits_to_invoices()
        await db.commit()
        voided = apply.get('voided_excess', 0)
        return MessageResponse(
            message="Credits applied to QBO",
            detail=f"Applied {apply['applied']} credits (${apply['total_applied']:.2f})"
                   + (f" | Voided excess: ${voided:.2f}" if voided else ""),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cron apply failed: {str(e)}")


@router.put("/{credit_id}", response_model=CreditLedgerOut)
async def update_credit(
    credit_id: uuid.UUID,
    updates: CreditUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Manually edit a credit entry's amount or notes."""
    result = await db.execute(
        select(CreditLedger)
        .where(CreditLedger.id == credit_id)
        .options(selectinload(CreditLedger.referral))
    )
    credit = result.scalar_one_or_none()
    if not credit:
        raise HTTPException(status_code=404, detail="Credit entry not found")

    if updates.credit_amount is not None:
        old_amount = Decimal(str(credit.credit_amount))
        new_amount = updates.credit_amount.quantize(Decimal("0.01"))
        credit.credit_amount = new_amount

        # Update referral total_credits_earned
        referral_result = await db.execute(
            select(Referral).where(Referral.id == credit.referral_id)
        )
        referral = referral_result.scalar_one_or_none()
        if referral:
            referral.total_credits_earned = (
                Decimal(str(referral.total_credits_earned)) - old_amount + new_amount
            )

        credit.notes = (
            (credit.notes or "") + f" [Manually adjusted on {__import__('datetime').date.today()}]"
        ).strip()

    if updates.notes is not None:
        credit.notes = updates.notes

    await db.commit()
    await db.refresh(credit)
    return credit


@router.post("/{credit_id}/mark-eligible", response_model=CreditLedgerOut)
async def mark_credit_eligible(
    credit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Manually promote a pending credit to eligible for testing purposes."""
    result = await db.execute(
        select(CreditLedger)
        .where(CreditLedger.id == credit_id)
        .options(selectinload(CreditLedger.referral))
    )
    credit = result.scalar_one_or_none()
    if not credit:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    if credit.status != CreditStatus.pending:
        raise HTTPException(status_code=400, detail=f"Credit is already '{credit.status}', not pending")

    credit.status = CreditStatus.eligible
    credit.notes = ((credit.notes or "") + f" [Manually marked eligible on {__import__('datetime').date.today()}]").strip()
    await db.commit()
    await db.refresh(credit)
    return credit


@router.post("/{credit_id}/mark-applied", response_model=CreditLedgerOut)
async def mark_credit_applied(
    credit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Manually mark a voided credit as applied (e.g. after a manual QBO adjustment)."""
    result = await db.execute(
        select(CreditLedger)
        .where(CreditLedger.id == credit_id)
        .options(selectinload(CreditLedger.referral))
    )
    credit = result.scalar_one_or_none()
    if not credit:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    if credit.status != CreditStatus.voided:
        raise HTTPException(status_code=400, detail=f"Credit is '{credit.status}', not voided — only voided credits can be manually marked applied")

    from datetime import date as date_type
    credit.status = CreditStatus.applied
    credit.applied_date = date_type.today()
    credit.notes = (
        (credit.notes or "") + f" [Manually marked applied on {date_type.today()}]"
    ).strip()

    # Restore referral totals that were reduced when this credit was voided
    referral_result = await db.execute(select(Referral).where(Referral.id == credit.referral_id))
    referral = referral_result.scalar_one_or_none()
    if referral:
        referral.total_credits_earned = (
            Decimal(str(referral.total_credits_earned)) + Decimal(str(credit.credit_amount))
        )
        referral.total_credits_applied = (
            Decimal(str(referral.total_credits_applied)) + Decimal(str(credit.credit_amount))
        )

    await db.commit()
    await db.refresh(credit)
    return credit


@router.post("/{credit_id}/recalculate", response_model=CreditLedgerOut)
async def recalculate_credit(
    credit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Re-fetch the Hubstaff invoice and recalculate this credit entry."""
    result = await db.execute(
        select(CreditLedger).where(CreditLedger.id == credit_id)
    )
    credit = result.scalar_one_or_none()
    if not credit:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    if not credit.hubstaff_invoice_id:
        raise HTTPException(status_code=400, detail="This credit has no Hubstaff invoice linked — cannot recalculate")

    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        updated = await service.recalculate_credit(credit_id)
        await db.commit()

        result2 = await db.execute(
            select(CreditLedger)
            .where(CreditLedger.id == credit_id)
            .options(selectinload(CreditLedger.referral))
        )
        return result2.scalar_one()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recalculation failed: {str(e)}")


@router.delete("/{credit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credit(
    credit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    """Hard-delete a credit entry and adjust the referral total."""
    result = await db.execute(select(CreditLedger).where(CreditLedger.id == credit_id))
    credit = result.scalar_one_or_none()
    if not credit:
        raise HTTPException(status_code=404, detail="Credit entry not found")

    # Roll back the referral total
    referral_result = await db.execute(select(Referral).where(Referral.id == credit.referral_id))
    referral = referral_result.scalar_one_or_none()
    if referral:
        referral.total_credits_earned = max(
            Decimal("0"),
            Decimal(str(referral.total_credits_earned)) - Decimal(str(credit.credit_amount)),
        )
        if credit.status == CreditStatus.applied:
            referral.total_credits_applied = max(
                Decimal("0"),
                Decimal(str(referral.total_credits_applied)) - Decimal(str(credit.credit_amount)),
            )

    await db.delete(credit)
    await db.commit()


@router.post("/sync-vas", response_model=MessageResponse)
async def sync_vas(
    current_user: User = Depends(require_owner),
):
    """Manually trigger the Assembly VA sync job."""
    try:
        from scheduler import job_sync_vas
        await job_sync_vas()
        return MessageResponse(message="VA sync completed successfully")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VA sync failed: {str(e)}")


@router.post("/apply", response_model=MessageResponse)
async def apply_pending_credits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        result = await service.apply_pending_credits_to_invoices()
        voided = result.get('voided_excess', 0)
        return MessageResponse(
            message="Credits applied to invoices successfully",
            detail=f"Applied {result['applied']} credits totaling ${result['total_applied']:.2f}"
                   + (f" — ${voided:.2f} voided (exceeded invoice balance)" if voided else ""),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apply credits failed: {str(e)}")
