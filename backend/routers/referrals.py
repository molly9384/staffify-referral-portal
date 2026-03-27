import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from auth import get_current_active_user, require_admin
from database import get_db
from models import Referral, CreditLedger, User, UserRole, ReferralStatus
from schemas import (
    ReferralCreate, ReferralOut, ReferralUpdate, ReferralStatusUpdate, CreditLedgerOut
)

router = APIRouter()


@router.get("", response_model=List[ReferralOut])
async def list_referrals(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = select(Referral).options(
        selectinload(Referral.referring_client),
        selectinload(Referral.referred_client),
        selectinload(Referral.virtual_assistants),
    )

    if current_user.role == UserRole.client:
        query = query.where(Referral.referring_client_id == current_user.client_id)

    if status_filter:
        try:
            status_enum = ReferralStatus(status_filter)
            query = query.where(Referral.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}")

    query = query.order_by(Referral.referral_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ReferralOut, status_code=status.HTTP_201_CREATED)
async def create_referral(
    referral_in: ReferralCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Clients can only create referrals for themselves
    if current_user.role == UserRole.client:
        if current_user.client_id != referral_in.referring_client_id:
            raise HTTPException(status_code=403, detail="Cannot create referral for another client")

    referral = Referral(**referral_in.model_dump())
    db.add(referral)
    await db.flush()

    result = await db.execute(
        select(Referral)
        .where(Referral.id == referral.id)
        .options(
            selectinload(Referral.referring_client),
            selectinload(Referral.referred_client),
            selectinload(Referral.virtual_assistants),
        )
    )
    return result.scalar_one()


@router.get("/{referral_id}", response_model=ReferralOut)
async def get_referral(
    referral_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(Referral)
        .where(Referral.id == referral_id)
        .options(
            selectinload(Referral.referring_client),
            selectinload(Referral.referred_client),
            selectinload(Referral.virtual_assistants),
        )
    )
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    if current_user.role == UserRole.client:
        if referral.referring_client_id != current_user.client_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return referral


@router.put("/{referral_id}", response_model=ReferralOut)
async def update_referral(
    referral_id: uuid.UUID,
    referral_update: ReferralUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(Referral)
        .where(Referral.id == referral_id)
        .options(
            selectinload(Referral.referring_client),
            selectinload(Referral.referred_client),
            selectinload(Referral.virtual_assistants),
        )
    )
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    update_data = referral_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(referral, field, value)

    # Auto-set expiration date when activation date is set
    if "activation_date" in update_data and update_data["activation_date"]:
        from dateutil.relativedelta import relativedelta
        try:
            from dateutil.relativedelta import relativedelta
            referral.expiration_date = update_data["activation_date"] + relativedelta(months=12)
        except ImportError:
            # Fallback without dateutil
            act_date = update_data["activation_date"]
            exp_year = act_date.year + 1
            referral.expiration_date = date(exp_year, act_date.month, act_date.day)

    await db.flush()
    await db.refresh(referral)
    return referral


@router.put("/{referral_id}/status", response_model=ReferralOut)
async def update_referral_status(
    referral_id: uuid.UUID,
    status_update: ReferralStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(Referral)
        .where(Referral.id == referral_id)
        .options(
            selectinload(Referral.referring_client),
            selectinload(Referral.referred_client),
            selectinload(Referral.virtual_assistants),
        )
    )
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    referral.status = status_update.status
    if status_update.notes:
        existing_notes = referral.pipeline_notes or ""
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y-%m-%d")
        referral.pipeline_notes = f"{existing_notes}\n[{timestamp}] {status_update.notes}".strip()

    await db.flush()
    await db.refresh(referral)
    return referral


@router.get("/{referral_id}/credits", response_model=List[CreditLedgerOut])
async def get_referral_credits(
    referral_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Verify referral exists and user has access
    result = await db.execute(select(Referral).where(Referral.id == referral_id))
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    if current_user.role == UserRole.client:
        if referral.referring_client_id != current_user.client_id:
            raise HTTPException(status_code=403, detail="Access denied")

    credits_result = await db.execute(
        select(CreditLedger)
        .where(CreditLedger.referral_id == referral_id)
        .order_by(CreditLedger.period_start.desc())
    )
    return credits_result.scalars().all()
