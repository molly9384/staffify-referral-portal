import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, EmailStr

from models import UserRole, ReferralStatus, CreditStatus


# --- Token Schemas ---

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: str
    full_name: str
    client_id: Optional[uuid.UUID] = None


class TokenData(BaseModel):
    user_id: Optional[str] = None
    role: Optional[str] = None


# --- User Schemas ---

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.client
    client_id: Optional[uuid.UUID] = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    client_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class ClientRegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str


class PortalUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    client_name: Optional[str] = None

    model_config = {"from_attributes": True}


class UserOut(UserBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Invite Schemas ---

class InviteCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole = UserRole.client
    client_id: Optional[uuid.UUID] = None


class AcceptInviteRequest(BaseModel):
    token: str
    full_name: str
    password: str


# --- Client Schemas ---

class ClientBase(BaseModel):
    name: str
    email: Optional[str] = None
    qbo_customer_id: Optional[str] = None
    hubstaff_project_id: Optional[str] = None
    hubstaff_project_name: Optional[str] = None
    is_active: bool = True


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    qbo_customer_id: Optional[str] = None
    hubstaff_project_id: Optional[str] = None
    hubstaff_project_name: Optional[str] = None
    is_active: Optional[bool] = None


class ClientOut(ClientBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClientSummary(BaseModel):
    id: uuid.UUID
    name: str
    email: Optional[str] = None

    model_config = {"from_attributes": True}


# --- Virtual Assistant Schemas ---

class VABase(BaseModel):
    hubstaff_user_id: Optional[str] = None
    hubstaff_user_name: str
    is_eligible: bool = False
    start_date: date
    end_date: Optional[date] = None
    is_active: bool = True


class VACreate(VABase):
    referral_id: uuid.UUID


class VAUpdate(BaseModel):
    hubstaff_user_id: Optional[str] = None
    hubstaff_user_name: Optional[str] = None
    is_eligible: Optional[bool] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class VAOut(VABase):
    id: uuid.UUID
    referral_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VATerminate(BaseModel):
    end_date: date
    pause_reason: Optional[str] = "VA terminated - sourcing replacement"


# --- Clock Period Schemas ---

class ClockPeriodOut(BaseModel):
    id: uuid.UUID
    referral_id: uuid.UUID
    va_id: uuid.UUID
    period_start: date
    period_end: Optional[date] = None
    pause_reason: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Referral Schemas ---

class ReferralBase(BaseModel):
    referring_client_id: uuid.UUID
    referred_name: str
    referred_email: Optional[EmailStr] = None
    referred_company: Optional[str] = None
    referred_phone: Optional[str] = None
    referred_website: Optional[str] = None
    status: ReferralStatus = ReferralStatus.referred
    pipeline_notes: Optional[str] = None
    referral_date: date


class ReferralCreate(ReferralBase):
    referral_date: Optional[date] = None


class ReferralUpdate(BaseModel):
    referred_client_id: Optional[uuid.UUID] = None
    referred_name: Optional[str] = None
    referred_email: Optional[EmailStr] = None
    referred_company: Optional[str] = None
    referred_phone: Optional[str] = None
    referred_website: Optional[str] = None
    referral_date: Optional[date] = None
    status: Optional[ReferralStatus] = None
    pipeline_notes: Optional[str] = None
    activation_date: Optional[date] = None
    expiration_date: Optional[date] = None
    is_active: Optional[bool] = None


class ReferralStatusUpdate(BaseModel):
    status: ReferralStatus
    notes: Optional[str] = None
    activation_date: Optional[date] = None


class ReferralOut(ReferralBase):
    id: uuid.UUID
    referred_client_id: Optional[uuid.UUID] = None
    activation_date: Optional[date] = None
    expiration_date: Optional[date] = None
    total_credits_earned: Decimal
    total_credits_applied: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime
    referring_client: Optional[ClientSummary] = None
    referred_client: Optional[ClientSummary] = None
    virtual_assistants: List[VAOut] = []

    model_config = {"from_attributes": True}


# --- Credit Ledger Schemas ---

class ReferralBrief(BaseModel):
    id: uuid.UUID
    referred_name: str

    model_config = {"from_attributes": True}


class CreditLedgerOut(BaseModel):
    id: uuid.UUID
    referral_id: uuid.UUID
    va_id: uuid.UUID
    period_start: date
    period_end: date
    hours_worked: Decimal
    credit_amount: Decimal
    status: CreditStatus
    hubstaff_invoice_id: Optional[str] = None
    hubstaff_invoice_number: Optional[str] = None
    qbo_invoice_id: Optional[str] = None
    applied_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    referral: Optional[ReferralBrief] = None

    model_config = {"from_attributes": True}


class CreditSummary(BaseModel):
    total_pending: Decimal
    total_eligible: Decimal
    total_applied: Decimal
    total_earned: Decimal
    pending_count: int
    eligible_count: int
    applied_count: int


# --- Hubstaff Schemas ---

class HubstaffEventOut(BaseModel):
    id: uuid.UUID
    event_type: str
    hubstaff_user_id: str
    hubstaff_user_name: str
    project_id: str
    project_name: str
    tracking_started_at: Optional[datetime] = None
    processed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class HubstaffProjectOut(BaseModel):
    id: str
    name: str
    status: Optional[str] = None


# --- Auth Login ---

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# --- Generic Response ---

class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
