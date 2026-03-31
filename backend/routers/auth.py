import os
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_active_user, require_admin_only
)
from config import settings
from database import get_db
from models import User, UserRole
from schemas import LoginRequest, Token, UserCreate, UserOut

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is inactive")

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role.value,
        user_id=str(user.id),
        full_name=user.full_name,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    result = await db.execute(select(User).where(User.email == user_in.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        client_id=user_in.client_id,
        is_active=user_in.is_active,
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)
    return new_user


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.post("/setup-admin")
async def setup_admin(setup_key: str, db: AsyncSession = Depends(get_db)):
    """One-time endpoint to create or reset the admin user. Requires ADMIN_SETUP_KEY env var."""
    expected_key = os.environ.get("ADMIN_SETUP_KEY", "")
    if not expected_key or setup_key != expected_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await db.execute(select(User).where(User.email == "admin@gostaffify.com"))
    existing = result.scalar_one_or_none()

    if existing:
        existing.hashed_password = get_password_hash("ChangeMe123!")
        existing.is_active = True
        await db.commit()
        return {"message": "Admin password reset to ChangeMe123!"}
    else:
        admin = User(
            email="admin@gostaffify.com",
            hashed_password=get_password_hash("ChangeMe123!"),
            full_name="Staffify Admin",
            role=UserRole.admin,
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        return {"message": "Admin user created with password ChangeMe123!"}
