import base64
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_active_user, require_admin
from models import Referral, CreditLedger, Client, User, ReferralStatus, CreditStatus
from services.email_service import send_email_with_attachment


class ReportEmailRequest(BaseModel):
    email: str
    subject: str
    filename: str
    pdf_base64: str

router = APIRouter()

ACTIVE_STATUSES = [ReferralStatus.va_billing, ReferralStatus.active]


@router.post("/send-email")
async def send_report_email(
    request: ReportEmailRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Receive a base64-encoded PDF from the frontend and email it as an attachment."""
    try:
        pdf_bytes = base64.b64decode(request.pdf_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF data.")

    from config import settings
    logo_url = f"{settings.FRONTEND_URL}/logo.png"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#333;">
      <img src="{logo_url}" alt="Staffify" style="height:40px;margin-bottom:24px;" />
      <h2 style="font-size:18px;margin:0 0 12px;color:#111;">Your Staffify Referral Report Is Ready! &#127881;</h2>
      <p style="margin:0 0 12px;">Please find your referral report attached to this email.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px;" />
      <p style="color:#aaa;font-size:12px;margin:0;">Staffify LLC &middot; Referral Portal</p>
    </div>
    """
    await send_email_with_attachment(
        to=[request.email],
        subject=request.subject,
        html=html,
        attachment_data=pdf_bytes,
        attachment_filename=request.filename,
    )
    return {"ok": True}


@router.get("/admin")
async def get_admin_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    client_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Referral filters — client filter applies, but date range does NOT filter by
    # referral_date. Referrals are created months before billing periods, so filtering
    # by referral_date would hide all active referrals when viewing a credit period.
    # The date range is used exclusively for credit filtering (applied_date / period dates).
    ref_filters = [Referral.is_active == True]
    if client_id:
        ref_filters.append(Referral.referring_client_id == client_id)

    # Credit filters:
    # - Applied credits filter by applied_date (when the credit was actually paid out)
    # - Pending/eligible credits filter by period_start/end (the billing period they cover)
    applied_credit_filters = [CreditLedger.status == CreditStatus.applied]
    pending_credit_filters = [CreditLedger.status.in_([CreditStatus.pending, CreditStatus.eligible])]
    if start_date:
        applied_credit_filters.append(CreditLedger.applied_date >= start_date)
        pending_credit_filters.append(CreditLedger.period_start >= start_date)
    if end_date:
        applied_credit_filters.append(CreditLedger.applied_date <= end_date)
        pending_credit_filters.append(CreditLedger.period_end <= end_date)
    if client_id:
        applied_credit_filters.append(
            CreditLedger.referral_id.in_(
                select(Referral.id).where(Referral.referring_client_id == client_id)
            )
        )
        pending_credit_filters.append(
            CreditLedger.referral_id.in_(
                select(Referral.id).where(Referral.referring_client_id == client_id)
            )
        )

    # Total referrals
    total_ref_result = await db.execute(
        select(func.count(Referral.id)).where(*ref_filters)
    )
    total_referrals = total_ref_result.scalar() or 0

    # Active referrals
    active_result = await db.execute(
        select(func.count(Referral.id)).where(
            *ref_filters,
            Referral.status.in_(ACTIVE_STATUSES)
        )
    )
    active_referrals = active_result.scalar() or 0

    # Unique referring clients
    clients_result = await db.execute(
        select(func.count(func.distinct(Referral.referring_client_id))).where(*ref_filters)
    )
    total_clients = clients_result.scalar() or 0

    # Pipeline breakdown
    pipeline_result = await db.execute(
        select(Referral.status, func.count(Referral.id).label("count"))
        .where(*ref_filters)
        .group_by(Referral.status)
    )
    pipeline = [
        {
            "status": row.status.value if hasattr(row.status, "value") else row.status,
            "count": row.count,
        }
        for row in pipeline_result
    ]

    # Credit totals — applied credits filtered by applied_date, pending/eligible by period dates
    applied_sum_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credit_amount), 0))
        .where(*applied_credit_filters)
    )
    total_applied = float(applied_sum_result.scalar() or 0)

    pending_sum_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credit_amount), 0))
        .where(*pending_credit_filters)
    )
    total_pending = float(pending_sum_result.scalar() or 0)

    total_earned = total_applied + total_pending

    # Top referrers — referral counts and active status from referral table
    top_q = (
        select(
            Client.id,
            Client.name,
            func.count(Referral.id).label("referrals_sent"),
            func.sum(
                case(
                    (Referral.status.in_(ACTIVE_STATUSES), 1),
                    else_=0,
                )
            ).label("active_referrals"),
        )
        .join(Referral, Referral.referring_client_id == Client.id)
        .where(*ref_filters)
        .group_by(Client.id, Client.name)
        .order_by(func.count(Referral.id).desc())
    )
    top_result = await db.execute(top_q)

    # Per-client applied credits filtered by applied_date (period-aware)
    applied_per_client_result = await db.execute(
        select(
            Referral.referring_client_id,
            func.coalesce(func.sum(CreditLedger.credit_amount), 0).label("credits_applied"),
        )
        .join(CreditLedger, CreditLedger.referral_id == Referral.id)
        .where(*applied_credit_filters)
        .group_by(Referral.referring_client_id)
    )
    applied_per_client = {
        str(row.referring_client_id): float(row.credits_applied)
        for row in applied_per_client_result
    }

    # Fetch active referral details per referring client for the expandable breakdown
    active_detail_result = await db.execute(
        select(
            Referral.id,
            Referral.referred_name,
            Referral.referring_client_id,
            Referral.status,
            Referral.total_credits_earned,
            Referral.total_credits_applied,
            Referral.activation_date,
        )
        .where(*ref_filters, Referral.status.in_(ACTIVE_STATUSES))
        .order_by(Referral.referred_name)
    )
    active_details_by_client: dict = {}
    for row in active_detail_result:
        cid = str(row.referring_client_id)
        active_details_by_client.setdefault(cid, []).append({
            "referral_id": str(row.id),
            "referred_name": row.referred_name,
            "status": row.status.value if hasattr(row.status, "value") else row.status,
            "credits_earned": float(row.total_credits_earned or 0),
            "credits_applied": float(row.total_credits_applied or 0),
            "activation_date": row.activation_date.isoformat() if row.activation_date else None,
        })

    top_referrers = [
        {
            "client_id": str(row.id),
            "client_name": row.name,
            "referrals_sent": row.referrals_sent,
            "active_referrals": int(row.active_referrals or 0),
            "credits_applied": applied_per_client.get(str(row.id), 0),
            "active_referral_details": active_details_by_client.get(str(row.id), []),
        }
        for row in top_result
    ]

    return {
        "summary": {
            "total_clients": total_clients,
            "total_referrals": total_referrals,
            "active_referrals": active_referrals,
            "total_credits_earned": total_earned,
            "total_credits_applied": total_applied,
            "total_credits_pending": total_pending,
        },
        "pipeline": pipeline,
        "top_referrers": top_referrers,
        "date_range": {
            "start": start_date.isoformat() if start_date else None,
            "end": end_date.isoformat() if end_date else None,
        },
        "filtered_client_id": client_id,
    }


@router.get("/client")
async def get_client_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not current_user.client_id:
        return {
            "summary": {
                "total_referrals": 0,
                "active_referrals": 0,
                "credits_earned": 0,
                "credits_pending": 0,
                "credits_applied": 0,
            },
            "referrals": [],
            "credits": [],
        }

    # Referral filters
    ref_filters = [
        Referral.referring_client_id == current_user.client_id,
        Referral.is_active == True,
    ]
    if start_date:
        ref_filters.append(Referral.referral_date >= start_date)
    if end_date:
        ref_filters.append(Referral.referral_date <= end_date)

    # Fetch referrals
    ref_result = await db.execute(
        select(Referral).where(*ref_filters).order_by(Referral.referral_date.desc())
    )
    referrals = ref_result.scalars().all()

    total_referrals = len(referrals)
    active_referrals = sum(1 for r in referrals if r.status in ACTIVE_STATUSES)
    credits_earned = sum(float(r.total_credits_earned or 0) for r in referrals)
    credits_applied = sum(float(r.total_credits_applied or 0) for r in referrals)
    credits_pending = max(credits_earned - credits_applied, 0)

    # Fetch credit ledger entries for this client's referrals
    credit_q = (
        select(CreditLedger, Referral.referred_name)
        .join(Referral, CreditLedger.referral_id == Referral.id)
        .where(
            Referral.referring_client_id == current_user.client_id,
            CreditLedger.status != CreditStatus.voided,
        )
    )
    if start_date:
        credit_q = credit_q.where(CreditLedger.period_start >= start_date)
    if end_date:
        credit_q = credit_q.where(CreditLedger.period_end <= end_date)
    credit_q = credit_q.order_by(CreditLedger.period_start.desc())

    credit_result = await db.execute(credit_q)
    credit_rows = credit_result.all()

    return {
        "summary": {
            "total_referrals": total_referrals,
            "active_referrals": active_referrals,
            "credits_earned": credits_earned,
            "credits_pending": credits_pending,
            "credits_applied": credits_applied,
        },
        "referrals": [
            {
                "id": str(r.id),
                "referred_name": r.referred_name,
                "status": r.status.value if hasattr(r.status, "value") else r.status,
                "referral_date": r.referral_date.isoformat() if r.referral_date else None,
                "credits_earned": float(r.total_credits_earned or 0),
                "credits_applied": float(r.total_credits_applied or 0),
            }
            for r in referrals
        ],
        "credits": [
            {
                "id": str(row.CreditLedger.id),
                "referral_name": row.referred_name,
                "period_start": row.CreditLedger.period_start.isoformat() if row.CreditLedger.period_start else None,
                "period_end": row.CreditLedger.period_end.isoformat() if row.CreditLedger.period_end else None,
                "hours_worked": float(row.CreditLedger.hours_worked or 0),
                "credit_amount": float(row.CreditLedger.credit_amount or 0),
                "status": row.CreditLedger.status.value if hasattr(row.CreditLedger.status, "value") else row.CreditLedger.status,
                "applied_date": row.CreditLedger.applied_date.isoformat() if row.CreditLedger.applied_date else None,
            }
            for row in credit_rows
        ],
    }
