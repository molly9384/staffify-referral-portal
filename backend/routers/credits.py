import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from auth import get_current_active_user, require_admin, require_admin_only
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

    return CreditSummary(
        total_pending=Decimal(str(pending_row[0])),
        total_applied=Decimal(str(applied_row[0])),
        total_earned=Decimal(str(total_earned)),
        pending_count=pending_row[1],
        applied_count=applied_row[1],
    )


@router.post("/run-automation", response_model=MessageResponse)
async def run_credit_automation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        result = await service.process_bi_weekly_credits()
        return MessageResponse(
            message="Credit automation completed successfully",
            detail=f"Processed {result['processed']} referrals, created {result['credits_created']} credit entries totaling ${result['total_amount']:.2f}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Automation failed: {str(e)}")


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


@router.post("/apply", response_model=MessageResponse)
async def apply_pending_credits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    try:
        from services.credit_service import CreditService
        service = CreditService(db)
        result = await service.apply_pending_credits_to_invoices()
        return MessageResponse(
            message="Credits applied to invoices successfully",
            detail=f"Applied {result['applied']} credits totaling ${result['total_applied']:.2f}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Apply credits failed: {str(e)}")
