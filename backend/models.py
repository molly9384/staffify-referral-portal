import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String, Boolean, DateTime, Date, Numeric, Text, JSON,
    ForeignKey, Enum as SAEnum, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

import enum


class UserRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    staff = "staff"
    client = "client"


class ReferralStatus(str, enum.Enum):
    referred = "referred"
    contacted = "contacted"
    call_scheduled = "call_scheduled"
    contract_signed = "contract_signed"
    va_hired = "va_hired"
    va_billing = "va_billing"
    active = "active"
    paused = "paused"
    expired = "expired"
    ceased = "ceased"


class CreditStatus(str, enum.Enum):
    pending = "pending"    # Waiting for Hubstaff invoice to be paid/closed
    eligible = "eligible"  # Invoice paid — ready to apply next billing cycle
    applied = "applied"    # Applied to referring client's QBO invoice
    voided = "voided"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False, default=UserRole.client)
    client_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    client: Mapped["Client | None"] = relationship("Client", back_populates="users", foreign_keys=[client_id])


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    qbo_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hubstaff_project_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hubstaff_project_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    users: Mapped[list["User"]] = relationship("User", back_populates="client", foreign_keys=[User.client_id])
    referrals_made: Mapped[list["Referral"]] = relationship(
        "Referral", back_populates="referring_client", foreign_keys="Referral.referring_client_id"
    )
    referrals_received: Mapped[list["Referral"]] = relationship(
        "Referral", back_populates="referred_client", foreign_keys="Referral.referred_client_id"
    )


class Referral(Base):
    __tablename__ = "referrals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referring_client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    referred_client_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    referred_name: Mapped[str] = mapped_column(String(255), nullable=False)
    referred_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    referred_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    referred_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    referred_website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[ReferralStatus] = mapped_column(SAEnum(ReferralStatus), nullable=False, default=ReferralStatus.referred)
    pipeline_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    referral_date: Mapped[date] = mapped_column(Date, nullable=False)
    activation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_credits_earned: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    total_credits_applied: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    referring_client: Mapped["Client"] = relationship("Client", back_populates="referrals_made", foreign_keys=[referring_client_id])
    referred_client: Mapped["Client | None"] = relationship("Client", back_populates="referrals_received", foreign_keys=[referred_client_id])
    virtual_assistants: Mapped[list["VirtualAssistant"]] = relationship("VirtualAssistant", back_populates="referral", cascade="all, delete-orphan")
    clock_periods: Mapped[list["VAClockPeriod"]] = relationship("VAClockPeriod", back_populates="referral", cascade="all, delete-orphan")
    credit_ledger: Mapped[list["CreditLedger"]] = relationship("CreditLedger", back_populates="referral", cascade="all, delete-orphan")


class VirtualAssistant(Base):
    __tablename__ = "virtual_assistants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referral_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("referrals.id"), nullable=False)
    hubstaff_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hubstaff_user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_eligible: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    referral: Mapped["Referral"] = relationship("Referral", back_populates="virtual_assistants")
    clock_periods: Mapped[list["VAClockPeriod"]] = relationship("VAClockPeriod", back_populates="va")
    credit_ledger: Mapped[list["CreditLedger"]] = relationship("CreditLedger", back_populates="va")


class VAClockPeriod(Base):
    __tablename__ = "va_clock_periods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referral_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("referrals.id"), nullable=False)
    va_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_assistants.id"), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    pause_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    referral: Mapped["Referral"] = relationship("Referral", back_populates="clock_periods")
    va: Mapped["VirtualAssistant"] = relationship("VirtualAssistant", back_populates="clock_periods")


class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referral_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("referrals.id"), nullable=False)
    va_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_assistants.id"), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    hours_worked: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    credit_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[CreditStatus] = mapped_column(SAEnum(CreditStatus), nullable=False, default=CreditStatus.pending)
    hubstaff_invoice_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True, unique=True)
    hubstaff_invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qbo_invoice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    applied_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    referral: Mapped["Referral"] = relationship("Referral", back_populates="credit_ledger")
    va: Mapped["VirtualAssistant"] = relationship("VirtualAssistant", back_populates="credit_ledger")


class HubstaffEvent(Base):
    __tablename__ = "hubstaff_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    hubstaff_user_id: Mapped[str] = mapped_column(String(100), nullable=False)
    hubstaff_user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    project_id: Mapped[str] = mapped_column(String(100), nullable=False)
    project_name: Mapped[str] = mapped_column(String(255), nullable=False)
    tracking_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SystemConfig(Base):
    """Key-value store for persisting system configuration (e.g. OAuth tokens)."""
    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")


class UserInvite(Base):
    __tablename__ = "user_invites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    invited_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    invited_by: Mapped["User"] = relationship("User", foreign_keys=[invited_by_id])
    client: Mapped["Client | None"] = relationship("Client", foreign_keys=[client_id])
