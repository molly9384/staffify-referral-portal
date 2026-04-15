import os
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_active_user, require_admin_only, require_owner
)
from config import settings
from database import get_db
from models import User, UserRole
from schemas import LoginRequest, Token, UserCreate, UserOut, ChangePasswordRequest, UpdateProfileRequest, ForgotPasswordRequest, ResetPasswordRequest, ClientRegisterRequest, PortalUserOut, InviteCreate, AcceptInviteRequest

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
    # Only owners can create admin or owner users
    if user_in.role in (UserRole.admin, UserRole.owner) and current_user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Only owners can create admin users")

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


@router.post("/impersonate/{user_id}")
async def impersonate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Generate a short-lived JWT for a client user so admins can preview their portal view."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role not in (UserRole.client,):
        raise HTTPException(status_code=400, detail="Can only impersonate client users")
    if not target.is_active:
        raise HTTPException(status_code=400, detail="User is inactive")

    token = create_access_token(
        data={"sub": str(target.id), "role": target.role.value, "impersonated_by": str(current_user.id)},
        expires_delta=timedelta(hours=2),
    )
    return Token(
        access_token=token,
        token_type="bearer",
        role=target.role.value,
        user_id=str(target.id),
        full_name=target.full_name,
        client_id=str(target.client_id) if target.client_id else None,
    )


@router.post("/test-email")
async def send_test_email(
    email_type: str,
    current_user: User = Depends(require_admin_only),
):
    """Send a test version of any system email to the current user's address."""
    from decimal import Decimal
    from services.email_service import (
        send_email,
        email_referral_confirmation,
        email_welcome_self_registered,
        email_welcome_admin_created,
        email_referral_active,
        email_referral_paused,
        email_referral_reinstated,
        email_pending_credits_statement,
        email_applied_credits_statement,
        email_invite,
    )

    dummy_credits = [
        {"referred_name": "Acme Corp", "period": "Mar 17 – Mar 31, 2026", "amount": Decimal("12.50")},
        {"referred_name": "Blue Ocean LLC", "period": "Mar 17 – Mar 31, 2026", "amount": Decimal("8.00")},
    ]

    templates = {
        "referral_confirmation": lambda: email_referral_confirmation(
            referring_client_name=current_user.full_name,
            referred_name="Acme Corp",
        ),
        "welcome_self_registered": lambda: email_welcome_self_registered(
            full_name=current_user.full_name,
            email=current_user.email,
        ),
        "welcome_admin_created": lambda: email_welcome_admin_created(
            full_name=current_user.full_name,
            email=current_user.email,
        ),
        "referral_active": lambda: email_referral_active(
            referring_client_name=current_user.full_name,
            referred_name="Acme Corp",
            activation_date="April 9, 2026",
        ),
        "referral_paused": lambda: email_referral_paused(
            referring_client_name=current_user.full_name,
            referred_name="Acme Corp",
            reason="VA contract has ended.",
        ),
        "referral_reinstated": lambda: email_referral_reinstated(
            referring_client_name=current_user.full_name,
            referred_name="Acme Corp",
        ),
        "pending_credits": lambda: email_pending_credits_statement(
            referring_client_name=current_user.full_name,
            credits=dummy_credits,
            total=Decimal("20.50"),
        ),
        "applied_credits": lambda: email_applied_credits_statement(
            referring_client_name=current_user.full_name,
            credits=dummy_credits,
            total=Decimal("20.50"),
        ),
        "invite": lambda: email_invite(
            invitee_name=current_user.full_name,
            inviter_name="Staffify",
            role="client",
            invite_url=f"{settings.FRONTEND_URL}/#/accept-invite?token=test-preview-token",
        ),
    }

    if email_type == "report":
        # Report email always includes a PDF attachment — send with a placeholder PDF
        from services.email_service import send_email_with_attachment
        from routers.reports import send_report_email as _report_route
        from config import settings as _s
        logo_url = f"{_s.FRONTEND_URL}/logo.png"
        html = f"""
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#333;">
          <img src="{logo_url}" alt="Staffify" style="height:40px;margin-bottom:24px;" />
          <h2 style="font-size:18px;margin:0 0 12px;color:#111;">Your Staffify Referral Report Is Ready! &#127881;</h2>
          <p style="margin:0 0 12px;">Please find your referral report attached to this email.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px;" />
          <p style="color:#aaa;font-size:12px;margin:0;">Staffify LLC &middot; Referral Portal</p>
        </div>
        """
        # Minimal valid PDF as placeholder attachment
        placeholder_pdf = (
            b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj "
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj "
            b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj "
            b"xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n"
            b"0000000058 00000 n\n0000000115 00000 n\n"
            b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
        )
        try:
            await send_email_with_attachment(
                to=[current_user.email],
                subject="[TEST] Your Staffify Referral Report Is Ready! 🎉",
                html=html,
                attachment_data=placeholder_pdf,
                attachment_filename="staffify-report-test.pdf",
            )
            return {"message": f"Test report email sent to {current_user.email}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to send test email: {str(e)}")

    if email_type not in templates:
        raise HTTPException(status_code=400, detail=f"Unknown email type: {email_type}")

    try:
        subject, html = templates[email_type]()
        subject = f"[TEST] {subject}"
        await send_email([current_user.email], subject, html)
        return {"message": f"Test email sent to {current_user.email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {str(e)}")


@router.post("/promote-owner")
async def promote_owner(setup_key: str, email: str, db: AsyncSession = Depends(get_db)):
    """One-time endpoint to promote a user to owner role. Requires ADMIN_SETUP_KEY env var."""
    expected_key = os.environ.get("ADMIN_SETUP_KEY", "")
    if not expected_key or setup_key != expected_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found with email: {email}")

    user.role = UserRole.owner
    user.is_active = True
    await db.commit()
    return {"message": f"{user.full_name} ({user.email}) has been promoted to owner."}


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

    # Admin notification
    if settings.ADMIN_EMAIL:
        recipients = [e.strip() for e in settings.ADMIN_EMAIL.split(",") if e.strip()]
        try:
            import asyncio
            from services.email_service import send_email
            html_body = (
                f"<p style='margin:0 0 16px;'>A new client has created a portal account.</p>"
                f"<table style='border-collapse:collapse;font-size:14px;'>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Name</td><td style='padding:4px 0;'><strong>{new_user.full_name}</strong></td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Email</td><td style='padding:4px 0;'>{new_user.email}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Client</td><td style='padding:4px 0;'>{client.name}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Sign-up Method</td><td style='padding:4px 0;'>Email / Password</td></tr>"
                f"</table>"
                f"<p style='margin-top:20px;'><a href='{settings.FRONTEND_URL}' style='color:#1abde1;'>View in Admin Portal</a></p>"
            )
            asyncio.create_task(send_email(recipients, f"New Portal Signup: {new_user.full_name}", html_body))
        except Exception as e:
            print(f"Admin signup notification failed: {e}")

    return new_user


@router.get("/portal-users", response_model=list[PortalUserOut])
async def list_portal_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """List all portal user accounts (client, admin, owner, staff)."""
    from models import Client
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .options(selectinload(User.client))
        .order_by(User.is_active.desc(), User.created_at.desc())
    )
    users = result.scalars().all()
    return [
        PortalUserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
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
    current_user: User = Depends(require_owner),
):
    """Remove a portal user account (owner only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await db.delete(user)
    await db.commit()


@router.patch("/portal-users/{user_id}/archive", status_code=status.HTTP_200_OK)
async def archive_portal_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    """Archive a portal user (owner only — soft delete, data preserved, login disabled)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot archive your own account")
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
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    await db.commit()
    return {"message": "User restored"}


@router.post("/invite", status_code=status.HTTP_201_CREATED)
async def create_invite(
    invite_in: InviteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_only),
):
    """Send an invite email. Admins can only invite clients; owners can invite any role."""
    from datetime import timezone
    from sqlalchemy import delete as sql_delete
    from models import UserInvite

    # Role permission check
    if invite_in.role != UserRole.client and current_user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Only owners can invite admin or staff users")

    # Block if account already exists
    existing_user = await db.execute(select(User).where(User.email == invite_in.email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account already exists for that email")

    # Delete any existing pending invite for this email so we don't pile up
    await db.execute(
        sql_delete(UserInvite).where(
            UserInvite.email == invite_in.email,
            UserInvite.accepted == False,
        )
    )

    import secrets
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=7)

    invite = UserInvite(
        email=invite_in.email,
        full_name=invite_in.full_name,
        role=invite_in.role,
        client_id=invite_in.client_id,
        token=token,
        invited_by_id=current_user.id,
        expires_at=expires,
    )
    db.add(invite)
    await db.commit()

    invite_url = f"{settings.FRONTEND_URL}/#/accept-invite?token={token}"
    try:
        from services.email_service import send_email, email_invite
        subject, html = email_invite(
            invitee_name=invite_in.full_name or invite_in.email,
            inviter_name=current_user.full_name,
            role=invite_in.role.value,
            invite_url=invite_url,
        )
        await send_email([invite_in.email], subject, html)
    except Exception as e:
        print(f"Invite email failed: {e}")

    return {"message": f"Invitation sent to {invite_in.email}"}


@router.get("/invite/{token}")
async def get_invite(token: str, db: AsyncSession = Depends(get_db)):
    """Return invite details so the accept page can prefill the form."""
    from datetime import timezone
    from models import UserInvite
    result = await db.execute(
        select(UserInvite).where(UserInvite.token == token, UserInvite.accepted == False)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This invite has expired")
    return {
        "email": invite.email,
        "full_name": invite.full_name,
        "role": invite.role.value,
    }


@router.post("/accept-invite", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def accept_invite(
    request: AcceptInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Accept an invite and create the user account."""
    from datetime import timezone
    from models import UserInvite

    result = await db.execute(
        select(UserInvite).where(UserInvite.token == request.token, UserInvite.accepted == False)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or already used invite")
    if invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This invite has expired. Please ask for a new one.")
    if len(request.full_name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Full name is required")
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = await db.execute(select(User).where(User.email == invite.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account already exists for that email")

    new_user = User(
        email=invite.email,
        hashed_password=get_password_hash(request.password),
        full_name=request.full_name.strip(),
        role=invite.role,
        client_id=invite.client_id,
        is_active=True,
    )
    db.add(new_user)
    invite.accepted = True
    await db.flush()
    await db.refresh(new_user)
    await db.commit()

    # Admin notification
    if settings.ADMIN_EMAIL:
        recipients = [e.strip() for e in settings.ADMIN_EMAIL.split(",") if e.strip()]
        try:
            import asyncio
            from services.email_service import send_email
            html_body = (
                f"<p style='margin:0 0 16px;'>A client has accepted their invite and created a portal account.</p>"
                f"<table style='border-collapse:collapse;font-size:14px;'>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Name</td><td style='padding:4px 0;'><strong>{new_user.full_name}</strong></td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Email</td><td style='padding:4px 0;'>{new_user.email}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Sign-up Method</td><td style='padding:4px 0;'>Invite</td></tr>"
                f"</table>"
                f"<p style='margin-top:20px;'><a href='{settings.FRONTEND_URL}' style='color:#1abde1;'>View in Admin Portal</a></p>"
            )
            asyncio.create_task(send_email(recipients, f"Invite Accepted: {new_user.full_name}", html_body))
        except Exception as e:
            print(f"Admin invite notification failed: {e}")

    return new_user


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

        # Admin notification for Google signup
        if settings.ADMIN_EMAIL:
            recipients = [e.strip() for e in settings.ADMIN_EMAIL.split(",") if e.strip()]
            try:
                from services.email_service import send_email
                html_body = (
                    f"<p style='margin:0 0 16px;'>A new client has created a portal account.</p>"
                    f"<table style='border-collapse:collapse;font-size:14px;'>"
                    f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Name</td><td style='padding:4px 0;'><strong>{user.full_name}</strong></td></tr>"
                    f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Email</td><td style='padding:4px 0;'>{user.email}</td></tr>"
                    f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Client</td><td style='padding:4px 0;'>{client.name}</td></tr>"
                    f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Sign-up Method</td><td style='padding:4px 0;'>Google</td></tr>"
                    f"</table>"
                    f"<p style='margin-top:20px;'><a href='{settings.FRONTEND_URL}' style='color:#1abde1;'>View in Admin Portal</a></p>"
                )
                await send_email(recipients, f"New Portal Signup: {user.full_name}", html_body)
            except Exception as e:
                print(f"Admin signup notification failed: {e}")

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


# ── Assembly SSO ──────────────────────────────────────────────────────────────

@router.post("/assembly-token")
async def assembly_token(token: str, db: AsyncSession = Depends(get_db)):
    """
    Called by the frontend AssemblyEntry page on load.
    Decrypts the Assembly SSO token, looks up the client by email,
    and returns either a JWT (existing user) or a 'new_user' flag with their email
    so the frontend can show the welcome/signup flow.
    """
    from models import Client
    from services.assembly import decrypt_assembly_token, get_assembly_client

    # 1. Decrypt token → get Assembly client ID
    if not settings.ASSEMBLY_API_KEY:
        raise HTTPException(status_code=503, detail="Assembly integration is not configured")

    try:
        payload = decrypt_assembly_token(settings.ASSEMBLY_API_KEY, token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    assembly_client_id = payload.get("clientId") or payload.get("client_id") or payload.get("id")
    if not assembly_client_id:
        raise HTTPException(status_code=400, detail="Token missing client ID — internal users should log in directly")

    # 2. Get email from Assembly API
    try:
        client_data = get_assembly_client(settings.ASSEMBLY_API_KEY, str(assembly_client_id))
        email = client_data.get("email") or (client_data.get("client") or {}).get("email", "")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Assembly API error: {e}")

    if not email:
        raise HTTPException(status_code=404, detail="Client not found in Assembly")

    email = email.lower().strip()

    # 3. Store assembly_client_id on the Client record if we have one
    client_result = await db.execute(select(Client).where(Client.email == email))
    client = client_result.scalar_one_or_none()
    if client and not client.assembly_client_id:
        client.assembly_client_id = str(assembly_client_id)
        await db.commit()

    # 4. Check if portal user exists
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()

    if user and user.is_active:
        # Existing user — issue JWT and auto-login
        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role.value},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        return {
            "status": "existing_user",
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role.value,
            "user_id": str(user.id),
            "full_name": user.full_name,
            "client_id": str(user.client_id) if user.client_id else None,
        }

    # New user — tell frontend to show welcome/signup flow
    return {
        "status": "new_user",
        "email": email,
        "client_name": client.name if client else None,
    }


@router.post("/assembly-signup", response_model=Token)
async def assembly_signup(
    request: ClientRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Called when a new Assembly user sets their password for the first time.
    Email is pre-confirmed from Assembly — they just choose a password.
    Creates the portal account and returns a JWT for immediate auto-login.
    """
    from models import Client
    from services.qbo_service import QBOService

    email = request.email.lower().strip()

    # Ensure no account already exists
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account already exists for that email. Please sign in.")

    # Find or create Client record
    client_result = await db.execute(select(Client).where(Client.email == email))
    client = client_result.scalar_one_or_none()

    if not client:
        # Try QBO lookup as fallback
        qbo = QBOService()
        qbo_customer = None
        if qbo.is_connected():
            try:
                qbo_customer = await qbo.find_customer_by_email(email)
            except Exception:
                pass

        if not qbo_customer:
            raise HTTPException(
                status_code=400,
                detail="We don't have an account on file for that email. Please contact Staffify at hello@gostaffify.com."
            )

        client = Client(
            name=qbo_customer["display_name"],
            email=email,
            qbo_customer_id=qbo_customer["id"],
            is_active=True,
        )
        db.add(client)
        await db.flush()

    # Create portal user
    new_user = User(
        email=email,
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

    # Admin notification
    if settings.ADMIN_EMAIL:
        recipients = [e.strip() for e in settings.ADMIN_EMAIL.split(",") if e.strip()]
        try:
            import asyncio
            from services.email_service import send_email
            html_body = (
                f"<p style='margin:0 0 16px;'>A new client signed up via Assembly.</p>"
                f"<table style='border-collapse:collapse;font-size:14px;'>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Name</td><td style='padding:4px 0;'><strong>{new_user.full_name}</strong></td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Email</td><td style='padding:4px 0;'>{new_user.email}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Client</td><td style='padding:4px 0;'>{client.name}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Sign-up Method</td><td style='padding:4px 0;'>Assembly SSO</td></tr>"
                f"</table>"
                f"<p style='margin-top:20px;'><a href='{settings.FRONTEND_URL}' style='color:#1abde1;'>View in Admin Portal</a></p>"
            )
            asyncio.create_task(send_email(recipients, f"New Portal Signup: {new_user.full_name}", html_body))
        except Exception as e:
            print(f"Admin signup notification failed: {e}")

    # Issue JWT for immediate auto-login
    access_token = create_access_token(
        data={"sub": str(new_user.id), "role": new_user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=new_user.role.value,
        user_id=str(new_user.id),
        full_name=new_user.full_name,
        client_id=str(new_user.client_id) if new_user.client_id else None,
    )
    return {"message": "Password reset successfully"}
