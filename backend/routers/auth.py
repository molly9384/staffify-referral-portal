import os
import uuid
from datetime import datetime, timedelta

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
from schemas import LoginRequest, Token, UserCreate, UserOut, ChangePasswordRequest, UpdateProfileRequest, ForgotPasswordRequest, ResetPasswordRequest, ClientRegisterRequest, PortalUserOut

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
        client_id=str(user.client_id) if user.client_id else None,
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

    # Welcome email for client-role users (admins don't need one)
    if new_user.role == UserRole.client:
        try:
            import asyncio
            from services.email_service import send_email, email_welcome_admin_created
            subject, html = email_welcome_admin_created(new_user.full_name, new_user.email)
            asyncio.create_task(send_email([new_user.email], subject, html))
        except Exception as e:
            print(f"Welcome email failed: {e}")

    return new_user


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.put("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    current_user.hashed_password = get_password_hash(request.new_password)
    await db.commit()
    return {"message": "Password updated successfully"}


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


@router.put("/update-profile")
async def update_profile(
    request: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if request.full_name:
        current_user.full_name = request.full_name
    if request.email:
        # Check email not already taken
        result = await db.execute(select(User).where(User.email == request.email, User.id != current_user.id))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = request.email
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    import secrets
    from datetime import timezone
    from models import PasswordResetToken
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    # Always return 200 to prevent email enumeration
    if user:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        reset_token = PasswordResetToken(user_id=user.id, token=token, expires_at=expires)
        db.add(reset_token)
        await db.commit()

        reset_url = f"{settings.FRONTEND_URL}/#/reset-password?token={token}"
        try:
            from services.email_service import send_email, _wrap, _btn
            subject = "Reset your Staffify password"
            html = _wrap(f"""
              <h2 style="color:#111;font-size:20px;margin:0 0 12px;">Reset your password</h2>
              <p style="margin:0 0 12px;">Click the button below to reset your password.
              This link expires in <strong>1 hour</strong>.</p>
              {_btn("Reset Password", reset_url)}
              <p style="margin:20px 0 0;font-size:12px;color:#aaa;">
                If you didn't request this, you can safely ignore this email.
              </p>
            """)
            await send_email([user.email], subject, html)
        except Exception as e:
            print(f"Password reset email failed: {e}")
    return {"message": "If an account exists with that email, a reset link has been sent."}


@router.post("/register-client", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register_client(request: ClientRegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Self-service client registration. Email must match a QBO customer (or existing Client record).
    Creates a Client record automatically if one doesn't exist yet.
    """
    # Check if a user account already exists for this email
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account already exists for that email. Please sign in.")

    # Check local Client table first
    from models import Client
    client_result = await db.execute(select(Client).where(Client.email == request.email))
    client = client_result.scalar_one_or_none()

    if not client:
        # Fall back to live QBO lookup
        from services.qbo_service import QBOService
        qbo = QBOService()
        if not qbo.is_connected():
            raise HTTPException(
                status_code=400,
                detail="We don't have an account on file for that email. Please contact Staffify."
            )
        try:
            qbo_customer = await qbo.find_customer_by_email(request.email)
        except Exception:
            qbo_customer = None

        if not qbo_customer:
            raise HTTPException(
                status_code=400,
                detail="We don't have an account on file for that email. Please contact Staffify."
            )

        # Create a Client record from QBO data
        client = Client(
            name=qbo_customer["display_name"],
            email=request.email,
            qbo_customer_id=qbo_customer["id"],
            is_active=True,
        )
        db.add(client)
        await db.flush()

    # Create the portal user account
    new_user = User(
        email=request.email,
        hashed_password=get_password_hash(request.password),
        full_name=request.full_name,
        role=UserRole.client,
        client_id=client.id,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)
    await db.commit()

    # Welcome email
    try:
        import asyncio
        from services.email_service import send_email, email_welcome_self_registered
        subject, html = email_welcome_self_registered(new_user.full_name, new_user.email)
        asyncio.create_task(send_email([new_user.email], subject, html))
    except Exception as e:
        print(f"Welcome email failed: {e}")

    return new_user


@router.get("/portal-users", response_model=list[PortalUserOut])
async def list_portal_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """List all client portal user accounts."""
    from models import Client
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.client)
        .options(selectinload(User.client))
        .order_by(User.is_active.desc(), User.created_at.desc())
    )
    users = result.scalars().all()
    return [
        PortalUserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            created_at=u.created_at,
            client_name=u.client.name if u.client else None,
        )
        for u in users
    ]


@router.delete("/portal-users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portal_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Remove a client portal user account."""
    result = await db.execute(select(User).where(User.id == user_id, User.role == UserRole.client))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()


@router.patch("/portal-users/{user_id}/archive", status_code=status.HTTP_200_OK)
async def archive_portal_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Archive a client portal user (soft delete — data preserved, login disabled)."""
    result = await db.execute(select(User).where(User.id == user_id, User.role == UserRole.client))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await db.commit()
    return {"message": "User archived"}

@router.patch("/portal-users/{user_id}/restore", status_code=status.HTTP_200_OK)
async def restore_portal_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Restore an archived portal user."""
    result = await db.execute(select(User).where(User.id == user_id, User.role == UserRole.client))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    await db.commit()
    return {"message": "User restored"}


@router.get("/google")
async def google_login():
    """Redirect user to Google's OAuth consent screen."""
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": f"{settings.BASE_URL}/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    })
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str = None, error: str = None, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback, issue JWT, redirect to frontend."""
    from fastapi.responses import RedirectResponse
    frontend_url = settings.FRONTEND_URL

    if error or not code:
        return RedirectResponse(url=f"{frontend_url}/#/login?error=google_cancelled")

    # Exchange code for tokens
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": f"{settings.BASE_URL}/api/auth/google/callback",
                    "grant_type": "authorization_code",
                },
            )
            token_data = token_resp.json()
            if "error" in token_data:
                return RedirectResponse(url=f"{frontend_url}/#/login?error=google_token_failed")

            # Get user info
            userinfo_resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            userinfo = userinfo_resp.json()
    except Exception:
        return RedirectResponse(url=f"{frontend_url}/#/login?error=google_failed")

    google_email = userinfo.get("email", "").lower()
    google_name = userinfo.get("name", "")

    if not google_email:
        return RedirectResponse(url=f"{frontend_url}/#/login?error=google_no_email")

    # Look up existing user
    result = await db.execute(select(User).where(User.email == google_email))
    user = result.scalar_one_or_none()

    if not user:
        # No account found — try to auto-register via QBO/Client lookup
        from models import Client
        client_result = await db.execute(select(Client).where(Client.email == google_email))
        client = client_result.scalar_one_or_none()

        if not client:
            from services.qbo_service import QBOService
            qbo = QBOService()
            qbo_customer = None
            if qbo.is_connected():
                try:
                    qbo_customer = await qbo.find_customer_by_email(google_email)
                except Exception:
                    pass
            if qbo_customer:
                client = Client(
                    name=qbo_customer["display_name"],
                    email=google_email,
                    qbo_customer_id=qbo_customer["id"],
                    is_active=True,
                )
                db.add(client)
                await db.flush()

        if not client:
            from urllib.parse import urlencode
            params = urlencode({"error": "google_no_account", "email": google_email})
            return RedirectResponse(url=f"{frontend_url}/#/login?{params}")

        # Auto-create portal user
        import secrets
        user = User(
            email=google_email,
            hashed_password=get_password_hash(secrets.token_hex(32)),
            full_name=google_name or google_email,
            role=UserRole.client,
            client_id=client.id,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        await db.commit()
        await db.refresh(user)

    if not user.is_active:
        return RedirectResponse(url=f"{frontend_url}/#/login?error=google_inactive")

    # Issue JWT
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    from urllib.parse import urlencode
    params = urlencode({
        "google_token": access_token,
        "role": user.role.value,
        "user_id": str(user.id),
        "full_name": google_name or user.full_name,
        "client_id": str(user.client_id) if user.client_id else "",
    })
    return RedirectResponse(url=f"{frontend_url}/#/login?{params}")


@router.post("/reset-password")
async def reset_password_endpoint(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    from datetime import timezone
    from models import PasswordResetToken
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == request.token,
            PasswordResetToken.used == False,
        )
    )
    reset_token = result.scalar_one_or_none()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if reset_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user_result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    user.hashed_password = get_password_hash(request.new_password)
    reset_token.used = True
    await db.commit()
    return {"message": "Password reset successfully"}
