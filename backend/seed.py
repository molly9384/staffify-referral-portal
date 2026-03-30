"""
Seed script: creates an initial admin user and sample data.
Run from the backend directory:
    python seed.py

Requires a running PostgreSQL database accessible via DATABASE_URL in .env
"""
import asyncio
import sys
import os

# Ensure the backend directory is on the path
sys.path.insert(0, os.path.dirname(__file__))

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import engine, Base, AsyncSessionLocal
from models import (
    User, Client, Referral, VirtualAssistant, VAClockPeriod,
    CreditLedger, UserRole, ReferralStatus, CreditStatus
)
from auth import get_password_hash


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created (or already exist).")


async def seed(db: AsyncSession):
    # ------------------------------------------------------------------ #
    # Admin user
    # ------------------------------------------------------------------ #
    existing = await db.execute(select(User).where(User.email == "admin@gostaffify.com"))
    if not existing.scalar_one_or_none():
        admin = User(
            email="admin@gostaffify.com",
            hashed_password=get_password_hash("ChangeMe123!"),
            full_name="Staffify Admin",
            role=UserRole.admin,
            is_active=True,
        )
        db.add(admin)
        print("Created admin user: admin@gostaffify.com / ChangeMe123!")
    else:
        print("Admin user already exists — skipping.")

    # ------------------------------------------------------------------ #
    # Sample clients
    # ------------------------------------------------------------------ #
    client_a = await db.execute(select(Client).where(Client.email == "acme@example.com"))
    client_a = client_a.scalar_one_or_none()
    if not client_a:
        client_a = Client(
            name="Acme Corp",
            email="acme@example.com",
            qbo_customer_id="123",
            hubstaff_project_id="456",
            hubstaff_project_name="Acme Corp Project",
            is_active=True,
        )
        db.add(client_a)
        await db.flush()
        print(f"Created client: Acme Corp (id={client_a.id})")
    else:
        print(f"Client Acme Corp already exists (id={client_a.id}) — skipping.")

    client_b = await db.execute(select(Client).where(Client.email == "beta@example.com"))
    client_b = client_b.scalar_one_or_none()
    if not client_b:
        client_b = Client(
            name="Beta Industries",
            email="beta@example.com",
            qbo_customer_id="456",
            hubstaff_project_id="789",
            hubstaff_project_name="Beta Industries Project",
            is_active=True,
        )
        db.add(client_b)
        await db.flush()
        print(f"Created client: Beta Industries (id={client_b.id})")
    else:
        print(f"Client Beta Industries already exists (id={client_b.id}) — skipping.")

    # ------------------------------------------------------------------ #
    # Client-role users linked to each client
    # ------------------------------------------------------------------ #
    user_a = await db.execute(select(User).where(User.email == "contact@acme.example.com"))
    user_a = user_a.scalar_one_or_none()
    if not user_a:
        user_a = User(
            email="contact@acme.example.com",
            hashed_password=get_password_hash("ChangeMe123!"),
            full_name="Alice Acme",
            role=UserRole.client,
            client_id=client_a.id,
            is_active=True,
        )
        db.add(user_a)
        print("Created client user: contact@acme.example.com / ChangeMe123!")

    # ------------------------------------------------------------------ #
    # Sample referral: Acme refers Beta
    # ------------------------------------------------------------------ #
    existing_referral = await db.execute(
        select(Referral).where(
            Referral.referring_client_id == client_a.id,
            Referral.referred_client_id == client_b.id,
        )
    )
    referral = existing_referral.scalar_one_or_none()
    if not referral:
        activation_date = date.today() - timedelta(days=60)  # 60 days into the window
        referral = Referral(
            referring_client_id=client_a.id,
            referred_client_id=client_b.id,
            referred_name="Beta Industries",
            referred_email="beta@example.com",
            status=ReferralStatus.active,
            referral_date=date.today() - timedelta(days=90),
            activation_date=activation_date,
            expiration_date=activation_date + timedelta(days=365),
            total_credits_earned=Decimal("120.00"),
            total_credits_applied=Decimal("80.00"),
            is_active=True,
            pipeline_notes="[Sample] Referral seeded for demo purposes.",
        )
        db.add(referral)
        await db.flush()
        print(f"Created referral: Acme → Beta Industries (id={referral.id})")

        # Eligible VA
        va = VirtualAssistant(
            referral_id=referral.id,
            hubstaff_user_id="99999",
            hubstaff_user_name="Maria Santos",
            is_eligible=True,
            start_date=activation_date,
            is_active=True,
        )
        db.add(va)
        await db.flush()
        print(f"Created VA: Maria Santos (id={va.id})")

        # Clock period (started at activation date, still running)
        clock_period = VAClockPeriod(
            referral_id=referral.id,
            va_id=va.id,
            period_start=activation_date,
            period_end=None,
        )
        db.add(clock_period)

        # Sample applied credit
        credit_applied = CreditLedger(
            referral_id=referral.id,
            va_id=va.id,
            period_start=activation_date,
            period_end=activation_date + timedelta(days=14),
            hours_worked=Decimal("80.00"),
            credit_amount=Decimal("80.00"),
            status=CreditStatus.applied,
            qbo_invoice_id="INV-001",
            applied_date=activation_date + timedelta(days=15),
            notes="Sample applied credit.",
        )
        db.add(credit_applied)

        # Sample pending credit
        next_period_start = activation_date + timedelta(days=14)
        credit_pending = CreditLedger(
            referral_id=referral.id,
            va_id=va.id,
            period_start=next_period_start,
            period_end=next_period_start + timedelta(days=14),
            hours_worked=Decimal("40.00"),
            credit_amount=Decimal("40.00"),
            status=CreditStatus.pending,
            notes="Sample pending credit.",
        )
        db.add(credit_pending)
        print("Created sample credit records (1 applied, 1 pending).")
    else:
        print(f"Referral Acme → Beta already exists (id={referral.id}) — skipping.")

    await db.commit()
    print("\nSeed complete!")
    print("----------------------------------------------")
    print("Admin login:  admin@gostaffify.com / ChangeMe123!")
    print("Client login: contact@acme.example.com / ChangeMe123!")
    print("----------------------------------------------")


async def main():
    await create_tables()
    async with AsyncSessionLocal() as db:
        await seed(db)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
