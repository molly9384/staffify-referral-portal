"""
Dashboard router — summary statistics for the internal dashboard.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from auth import require_admin
from database import get_db
from models import Referral, CreditLedger, Client, User, ReferralStatus, CreditStatus

router = APIRouter()


@router.get("/summary")
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Returns high-level counts and totals for the admin dashboard.
    """
    # Total referrals
    total_referrals_result = await db.execute(select(func.count(Referral.id)))
    total_referrals = total_referrals_result.scalar() or 0

    # Active referrals (status = active)
    active_result = await db.execute(
        select(func.count(Referral.id)).where(Referral.status == ReferralStatus.active)
    )
    active_referrals = active_result.scalar() or 0

    # Paused referrals
    paused_result = await db.execute(
        select(func.count(Referral.id)).where(Referral.status == ReferralStatus.paused)
    )
    paused_referrals = paused_result.scalar() or 0

    # VA billing referrals
    va_billing_result = await db.execute(
        select(func.count(Referral.id)).where(Referral.status == ReferralStatus.va_billing)
    )
    va_billing_referrals = va_billing_result.scalar() or 0

    # Total credits earned (non-voided)
    total_earned_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credit_amount), 0))
        .where(CreditLedger.status != CreditStatus.voided)
    )
    total_credits_earned = Decimal(str(total_earned_result.scalar() or 0))

    # Credits pending
    pending_result = await db.execute(
        select(
            func.coalesce(func.sum(CreditLedger.credit_amount), 0),
            func.count(CreditLedger.id),
        ).where(CreditLedger.status == CreditStatus.pending)
    )
    pending_row = pending_result.one()
    credits_pending = Decimal(str(pending_row[0]))
    credits_pending_count = pending_row[1]

    # Credits applied
    applied_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.credit_amount), 0))
        .where(CreditLedger.status == CreditStatus.applied)
    )
    credits_applied = Decimal(str(applied_result.scalar() or 0))

    # Total active clients
    active_clients_result = await db.execute(
        select(func.count(Client.id)).where(Client.is_active == True)
    )
    active_clients = active_clients_result.scalar() or 0

    return {
        "success": True,
        "data": {
            "total_referrals": total_referrals,
            "active_referrals": active_referrals,
            "paused_referrals": paused_referrals,
            "va_billing_referrals": va_billing_referrals,
            "total_credits_earned": float(total_credits_earned),
            "credits_pending": float(credits_pending),
            "credits_pending_count": credits_pending_count,
            "credits_applied": float(credits_applied),
            "active_clients": active_clients,
        },
        "message": "Dashboard summary fetched successfully",
    }


@router.get("/referral-pipeline")
async def get_referral_pipeline(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Returns counts of referrals grouped by pipeline status.
    """
    result = await db.execute(
        select(Referral.status, func.count(Referral.id))
        .group_by(Referral.status)
    )
    rows = result.all()
    pipeline = {status.value: count for status, count in rows}

    # Ensure all known statuses are present (even if count is 0)
    all_statuses = [s.value for s in ReferralStatus]
    for s in all_statuses:
        pipeline.setdefault(s, 0)

    return {
        "success": True,
        "data": pipeline,
        "message": "Pipeline counts fetched successfully",
    }
