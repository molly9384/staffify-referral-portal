import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from auth import get_current_active_user, require_admin, require_owner
from config import settings
from database import get_db
from models import Referral, CreditLedger, User, UserRole, ReferralStatus
from schemas import (
    ReferralCreate, ReferralOut, ReferralUpdate, ReferralStatusUpdate, CreditLedgerOut
)

router = APIRouter()


async def _send_new_referral_notifications(referral: Referral, referring_client_name: str):
    import httpx

    referred   = referral.referred_name or "—"
    company    = referral.referred_company or "—"
    email      = referral.referred_email or "—"
    phone      = referral.referred_phone or "—"
    website    = referral.referred_website or "—"
    notes      = referral.pipeline_notes or "—"
    referrer   = referring_client_name
    ref_date   = referral.referral_date.strftime("%B %-d, %Y") if referral.referral_date else "—"

    # Slack
    if settings.SLACK_WEBHOOK_URL:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    settings.SLACK_WEBHOOK_URL,
                    json={"text": (
                        f":tada: *New Referral Submitted*\n"
                        f"*Referred:* {referred}\n"
                        f"*Company:* {company}\n"
                        f"*Email:* {email}\n"
                        f"*Phone:* {phone}\n"
                        f"*Website:* {website}\n"
                        f"*Referred By:* {referrer}\n"
                        f"*Date:* {ref_date}\n"
                        f"*Notes:* {notes}"
                    )},
                    timeout=10,
                )
        except Exception as e:
            print(f"Slack notification failed: {e}")

    # Admin email notification
    if settings.ADMIN_EMAIL:
        recipients = [e.strip() for e in settings.ADMIN_EMAIL.split(",") if e.strip()]
        try:
            from services.email_service import send_email
            html_body = (
                f"<p style='margin:0 0 16px;'>A new referral has been submitted.</p>"
                f"<table style='border-collapse:collapse;font-size:14px;'>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Referred</td><td style='padding:4px 0;'><strong>{referred}</strong></td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Company</td><td style='padding:4px 0;'>{company}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Email</td><td style='padding:4px 0;'>{email}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Phone</td><td style='padding:4px 0;'>{phone}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Website</td><td style='padding:4px 0;'>{website}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Referred By</td><td style='padding:4px 0;'>{referrer}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;'>Date</td><td style='padding:4px 0;'>{ref_date}</td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0;color:#888;vertical-align:top;'>Notes</td><td style='padding:4px 0;'>{notes}</td></tr>"
                f"</table>"
                f"<p style='margin-top:20px;'><a href='{settings.FRONTEND_URL}' style='color:#1abde1;'>View in Portal</a></p>"
            )
            await send_email(recipients, f"New Referral: {referred}", html_body)
        except Exception as e:
            print(f"Email notification failed: {e}")


@router.get("", response_model=List[ReferralOut])
async def list_referrals(
    status_filter: Optional[str] = Query(None, alias="status"),
    archived: Optional[bool] = Query(None),
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
        query = query.where(Referral.is_active == True)
    else:
        # Admins/staff: filter by archived flag (default to active only)
        if archived:
            query = query.where(Referral.is_active == False)
        else:
            query = query.where(Referral.is_active == True)

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

    # Duplicate check — block if referred person already exists as a client or active referral
    if referral_in.referred_name:
        from sqlalchemy import func
        from models import Client
        name_lower = referral_in.referred_name.strip().lower()

        existing_referral = await db.execute(
            select(Referral.id).where(
                func.lower(Referral.referred_name) == name_lower,
                Referral.is_active == True,
            ).limit(1)
        )
        if existing_referral.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"It looks like {referral_in.referred_name} has already been submitted as a referral! If you think this might be a mistake, feel free to reach out to us at hello@gostaffify.com or message us in your client portal."
            )

        existing_client = await db.execute(
            select(Client.id).where(
                func.lower(Client.name) == name_lower,
                Client.is_active == True,
            ).limit(1)
        )
        if existing_client.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Great minds think alike! {referral_in.referred_name} is already part of the Staffify family, so they don't qualify for the referral program. Have another contact in mind? We'd love the intro!"
            )

    from datetime import date as date_type
    if not referral_in.referral_date:
        referral_in.referral_date = date_type.today()

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
    created = result.scalar_one()

    # Fire-and-forget notifications (don't block response)
    import asyncio
    referring_client_name = created.referring_client.name if created.referring_client else "Unknown"
    asyncio.create_task(_send_new_referral_notifications(created, referring_client_name))

    # Confirmation email to the referring client
    if created.referring_client_id:
        try:
            from services.email_service import send_email, get_client_emails, email_referral_confirmation
            client_emails = await get_client_emails(db, created.referring_client_id)
            if client_emails:
                subject, html = email_referral_confirmation(referring_client_name, created.referred_name or "your contact")
                asyncio.create_task(send_email(client_emails, subject, html))
        except Exception as e:
            print(f"Referral confirmation email failed: {e}")

    return created


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

    from models import Client
    prev_status = referral.status
    new_status = status_update.status
    referral.status = new_status

    if status_update.notes:
        existing_notes = referral.pipeline_notes or ""
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y-%m-%d")
        referral.pipeline_notes = f"{existing_notes}\n[{timestamp}] {status_update.notes}".strip()

    # Apply manually provided activation date (overrides auto-logic)
    if status_update.activation_date:
        referral.activation_date = status_update.activation_date

    # At VA Billing: auto-create client profile from Hubstaff + QBO if not already linked
    if new_status == ReferralStatus.va_billing and not referral.referred_client_id:
        try:
            from services.hubstaff_service import HubstaffService
            from services.qbo_service import QBOService
            from config import settings as app_settings

            hubstaff = HubstaffService()
            qbo = QBOService()

            # Find matching Hubstaff project by name (exact first, then starts-with)
            projects = await hubstaff.get_projects(app_settings.HUBSTAFF_ORG_ID)
            ref_name_lower = referral.referred_name.strip().lower()
            matched_project = next(
                (p for p in projects if p.get("name", "").strip().lower() == ref_name_lower), None
            )
            if not matched_project:
                # Fallback: first name match (e.g. "Jonathan" matches "Jonathan Gonzales")
                first_word = ref_name_lower.split()[0] if ref_name_lower else ""
                matched_project = next(
                    (p for p in projects if p.get("name", "").strip().lower().startswith(first_word) and first_word),
                    None
                )

            # Find matching QBO customer by name
            qbo_customer = None
            if qbo.is_connected():
                try:
                    qbo_customer = await qbo.find_customer_by_name(referral.referred_name)
                except Exception:
                    pass

            # Create the client profile
            new_client = Client(
                name=referral.referred_name,
                email=qbo_customer.get("email") if qbo_customer else None,
                hubstaff_project_id=matched_project.get("id") if matched_project else None,
                hubstaff_project_name=matched_project.get("name") if matched_project else None,
                qbo_customer_id=qbo_customer.get("id") if qbo_customer else None,
                is_active=True,
            )
            db.add(new_client)
            await db.flush()
            referral.referred_client_id = new_client.id
        except Exception as e:
            print(f"Warning: could not auto-create referred client profile: {e}")

    # Auto-set activation date when VA billing starts (only if not manually provided)
    if new_status == ReferralStatus.va_billing and not referral.activation_date and not status_update.activation_date:
        referral.activation_date = date.today()

    await db.flush()
    await db.refresh(referral)

    # Client status-change emails
    if referral.referring_client_id:
        try:
            import asyncio
            from services.email_service import (
                send_email, get_client_emails,
                email_referral_active, email_referral_reinstated, email_referral_paused,
            )
            client_emails = await get_client_emails(db, referral.referring_client_id)
            client_name = referral.referring_client.name if referral.referring_client else ""
            referred = referral.referred_name or "your contact"

            if client_emails:
                if new_status == ReferralStatus.va_billing and prev_status == ReferralStatus.paused:
                    # Reinstated from paused
                    subject, html = email_referral_reinstated(client_name, referred)
                    asyncio.create_task(send_email(client_emails, subject, html))
                elif new_status == ReferralStatus.va_billing:
                    # Newly active
                    act = referral.activation_date.strftime("%B %-d, %Y") if referral.activation_date else "today"
                    subject, html = email_referral_active(client_name, referred, act)
                    asyncio.create_task(send_email(client_emails, subject, html))
                elif new_status == ReferralStatus.paused:
                    reason = status_update.notes or ""
                    subject, html = email_referral_paused(client_name, referred, reason)
                    asyncio.create_task(send_email(client_emails, subject, html))
        except Exception as e:
            print(f"Status-change client email failed: {e}")

    return referral


@router.patch("/{referral_id}/archive", status_code=status.HTTP_200_OK)
async def archive_referral(
    referral_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    result = await db.execute(select(Referral).where(Referral.id == referral_id))
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")
    referral.is_active = False
    await db.commit()
    return {"message": "Referral archived"}


@router.patch("/{referral_id}/restore", status_code=status.HTTP_200_OK)
async def restore_referral(
    referral_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Referral).where(Referral.id == referral_id))
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")
    referral.is_active = True
    await db.commit()
    return {"message": "Referral restored"}


@router.delete("/{referral_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_referral(
    referral_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    result = await db.execute(select(Referral).where(Referral.id == referral_id))
    referral = result.scalar_one_or_none()
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")
    if referral.is_active:
        raise HTTPException(status_code=400, detail="Archive the referral before deleting it.")
    await db.delete(referral)
    await db.commit()


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
        .options(selectinload(CreditLedger.referral))
        .order_by(CreditLedger.period_start.desc())
    )
    return credits_result.scalars().all()
