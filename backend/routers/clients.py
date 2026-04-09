import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from auth import get_current_active_user, require_admin, require_owner
from database import get_db
from models import Client, Referral, User, UserRole
from schemas import ClientCreate, ClientOut, ClientUpdate, ReferralOut

router = APIRouter()


@router.get("", response_model=List[ClientOut])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Client).order_by(Client.name))
    return result.scalars().all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    client_in: ClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    client = Client(**client_in.model_dump())
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Clients can only see their own record
    if current_user.role == UserRole.client:
        if current_user.client_id != client_id:
            raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.put("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: uuid.UUID,
    client_update: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in client_update.model_dump(exclude_unset=True).items():
        setattr(client, field, value)

    await db.flush()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Block delete if client has referrals (referring_client_id is NOT NULL)
    referral_check = await db.execute(
        select(Referral.id).where(Referral.referring_client_id == client_id).limit(1)
    )
    if referral_check.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a client who has submitted referrals. Archive them instead, or delete their referrals first."
        )

    await db.delete(client)
    await db.commit()


@router.get("/{client_id}/referrals", response_model=List[ReferralOut])
async def get_client_referrals(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role == UserRole.client:
        if current_user.client_id != client_id:
            raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(Referral)
        .where(Referral.referring_client_id == client_id)
        .options(
            selectinload(Referral.referring_client),
            selectinload(Referral.referred_client),
            selectinload(Referral.virtual_assistants),
        )
        .order_by(Referral.referral_date.desc())
    )
    return result.scalars().all()
