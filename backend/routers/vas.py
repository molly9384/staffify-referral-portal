import uuid
from typing import List
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from auth import get_current_active_user, require_admin
from database import get_db
from models import VirtualAssistant, Referral, VAClockPeriod, User, UserRole
from schemas import VACreate, VAOut, VAUpdate, VATerminate, ClockPeriodOut

router = APIRouter()


@router.get("/api/referrals/{referral_id}/vas", response_model=List[VAOut])
async def list_vas_for_referral(
    referral_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Referral).where(Referral.id == referral_id))
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    if current_user.role == UserRole.client:
        if referral.referring_client_id != current_user.client_id:
            raise HTTPException(status_code=403, detail="Access denied")

    vas_result = await db.execute(
        select(VirtualAssistant)
        .where(VirtualAssistant.referral_id == referral_id)
        .order_by(VirtualAssistant.start_date.asc())
    )
    return vas_result.scalars().all()


@router.post("/api/referrals/{referral_id}/vas", response_model=VAOut, status_code=status.HTTP_201_CREATED)
async def add_va_to_referral(
    referral_id: uuid.UUID,
    va_in: VACreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Referral).where(Referral.id == referral_id))
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    # Check if there's already an eligible VA for this referral
    existing_eligible_result = await db.execute(
        select(VirtualAssistant).where(
            VirtualAssistant.referral_id == referral_id,
            VirtualAssistant.is_eligible == True,
            VirtualAssistant.is_active == True,
        )
    )
    has_eligible = existing_eligible_result.scalar_one_or_none()

    # Check if there's any VA at all (first VA = eligible)
    existing_vas_result = await db.execute(
        select(VirtualAssistant).where(VirtualAssistant.referral_id == referral_id)
    )
    all_vas = existing_vas_result.scalars().all()
    is_first_va = len(all_vas) == 0

    va_data = va_in.model_dump()
    va_data["referral_id"] = referral_id

    # First VA is always eligible
    if is_first_va:
        va_data["is_eligible"] = True

    va = VirtualAssistant(**va_data)
    db.add(va)
    await db.flush()

    # If this is the first VA or replacing an eligible VA, start a clock period
    if va.is_eligible:
        clock_period = VAClockPeriod(
            referral_id=referral_id,
            va_id=va.id,
            period_start=va.start_date,
            period_end=None,
        )
        db.add(clock_period)

    await db.flush()
    await db.refresh(va)
    return va


@router.put("/api/vas/{va_id}", response_model=VAOut)
async def update_va(
    va_id: uuid.UUID,
    va_update: VAUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(VirtualAssistant).where(VirtualAssistant.id == va_id))
    va = result.scalar_one_or_none()
    if not va:
        raise HTTPException(status_code=404, detail="VA not found")

    for field, value in va_update.model_dump(exclude_unset=True).items():
        setattr(va, field, value)

    await db.flush()
    await db.refresh(va)
    return va


@router.post("/api/vas/{va_id}/terminate", response_model=VAOut)
async def terminate_va(
    va_id: uuid.UUID,
    terminate_data: VATerminate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(VirtualAssistant).where(VirtualAssistant.id == va_id))
    va = result.scalar_one_or_none()
    if not va:
        raise HTTPException(status_code=404, detail="VA not found")

    va.end_date = terminate_data.end_date
    va.is_active = False

    # If eligible VA terminated, pause the clock
    if va.is_eligible:
        # Close current open clock period
        clock_result = await db.execute(
            select(VAClockPeriod).where(
                VAClockPeriod.va_id == va_id,
                VAClockPeriod.period_end == None,
            )
        )
        open_period = clock_result.scalar_one_or_none()
        if open_period:
            open_period.period_end = terminate_data.end_date
            open_period.pause_reason = terminate_data.pause_reason

        # Update referral status to paused
        referral_result = await db.execute(
            select(Referral)
            .where(Referral.id == va.referral_id)
            .options(selectinload(Referral.referring_client))
        )
        referral = referral_result.scalar_one_or_none()
        if referral:
            referral.status = "paused"

            # Send paused email to referring client
            try:
                import asyncio
                from services.email_service import send_email, get_client_emails, email_referral_paused
                client_emails = await get_client_emails(db, referral.referring_client_id)
                if client_emails:
                    client_name = referral.referring_client.name if referral.referring_client else ""
                    referred = referral.referred_name or "your contact"
                    reason = terminate_data.pause_reason or ""
                    subject, html = email_referral_paused(client_name, referred, reason)
                    asyncio.create_task(send_email(client_emails, subject, html))
            except Exception as e:
                print(f"Paused email on VA terminate failed: {e}")

    await db.flush()
    await db.refresh(va)
    return va


@router.post("/api/referrals/{referral_id}/vas/{va_id}/set-eligible", response_model=VAOut)
async def set_eligible_va(
    referral_id: uuid.UUID,
    va_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Unset all currently eligible VAs for this referral
    await db.execute(
        update(VirtualAssistant)
        .where(VirtualAssistant.referral_id == referral_id)
        .values(is_eligible=False)
    )

    # Set the specified VA as eligible
    result = await db.execute(
        select(VirtualAssistant).where(
            VirtualAssistant.id == va_id,
            VirtualAssistant.referral_id == referral_id,
        )
    )
    va = result.scalar_one_or_none()
    if not va:
        raise HTTPException(status_code=404, detail="VA not found for this referral")

    va.is_eligible = True

    # Resume clock: create new open clock period for this VA
    clock_period = VAClockPeriod(
        referral_id=referral_id,
        va_id=va_id,
        period_start=va.start_date,
        period_end=None,
    )
    db.add(clock_period)

    # Update referral status back to active
    referral_result = await db.execute(select(Referral).where(Referral.id == referral_id))
    referral = referral_result.scalar_one_or_none()
    if referral:
        referral.status = "active"

    await db.flush()
    await db.refresh(va)
    return va
