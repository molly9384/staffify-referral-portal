from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_active_user, require_admin
from models import Referral, CreditLedger, Client, User, ReferralStatus, CreditStatus

router = APIRouter()

ACTIVE_STATUSES = [ReferralStatus.va_billing, ReferralStatus.active]


@router.get("/admin")
async def get_admin_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Referral filters
    ref_filters = [Referral.is_active == True]
    if start_date:
        ref_filters.append(Referral.referral_date >= start_date)
    if end_date:
        ref_filters.append(Referral.referral_date <= end_date)

    # Credit filters
    credit_filters = []
    if start_date:
        credit_filters.append(CreditLedger.period_start >= start_date)
    if end_date:
        credit_filters.append(CreditLedger.period_end <= end_date)

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

    # Credit totals by status
    credit_q = (
        select(
            CreditLedger.status,
            func.sum(CreditLedger.credit_amount).label("total"),
        )
        .group_by(CreditLedger.status)
    )
    if credit_filters:
        credit_q = credit_q.where(*credit_filters)
    credit_result = await db.execute(credit_q)
    credit_by_status = {
        (row.status.value if hasattr(row.status, "value") else row.status): float(row.total or 0)
        for row in credit_result
    }
    total_earned = sum(credit_by_status.get(s, 0) for s in ["pending", "eligible", "applied"])
    total_applied = credit_by_status.get("applied", 0)
    total_pending = credit_by_status.get("pending", 0) + credit_by_status.get("eligible", 0)

    # Top referrers
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
            func.coalesce(func.sum(Referral.total_credits_earned), 0).label("credits_earned"),
            func.coalesce(func.sum(Referral.total_credits_applied), 0).label("credits_applied"),
        )
        .join(Referral, Referral.referring_client_id == Client.id)
        .where(*ref_filters)
        .group_by(Client.id, Client.name)
        .order_by(func.count(Referral.id).desc())
    )
    top_result = await db.execute(top_q)
    top_referrers = [
        {
            "client_id": str(row.id),
            "client_name": row.name,
            "referrals_sent": row.referrals_sent,
            "active_referrals": int(row.active_referrals or 0),
            "credits_earned": float(row.credits_earned or 0),
            "credits_applied": float(row.credits_applied or 0),
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
