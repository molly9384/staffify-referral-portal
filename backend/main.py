from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import engine, Base
from routers import auth, clients, referrals, vas, credits, hubstaff, qbo, dashboard
from scheduler import start_scheduler, stop_scheduler


async def load_system_config():
    """Load persisted settings (e.g. Hubstaff OAuth tokens) from DB into the settings object."""
    from sqlalchemy import select
    from database import AsyncSessionLocal
    from models import SystemConfig
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(SystemConfig))
            rows = result.scalars().all()
            for row in rows:
                if hasattr(settings, row.key) and row.value:
                    setattr(settings, row.key, row.value)
    except Exception as e:
        print(f"Config load skipped: {e}")


async def create_admin_user():
    """Create default admin user if they don't exist yet."""
    from sqlalchemy import select
    from database import AsyncSessionLocal
    from models import User, UserRole
    from auth import get_password_hash
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.email == "admin@gostaffify.com")
            )
            if result.scalar_one_or_none() is None:
                admin = User(
                    email="admin@gostaffify.com",
                    hashed_password=get_password_hash("ChangeMe123!"),
                    full_name="Staffify Admin",
                    role=UserRole.admin,
                    is_active=True,
                )
                session.add(admin)
                await session.commit()
                print("Admin user created.")
    except Exception as e:
        print(f"Seed skipped: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables if they don't exist (dev convenience; use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add new enum values that create_all won't add to existing types
    from sqlalchemy import text
    async with engine.connect() as conn:
        await conn.execute(text("ALTER TYPE creditstatus ADD VALUE IF NOT EXISTS 'eligible'"))
        await conn.commit()

    # Create admin user if none exists
    await create_admin_user()

    # Load persisted OAuth tokens and other config from DB
    await load_system_config()

    # Start the bi-weekly credit automation scheduler
    start_scheduler()

    yield

    # Shutdown
    stop_scheduler()
    await engine.dispose()


app = FastAPI(
    title="Staffify Referral Portal API",
    description="Backend API for the Staffify Referral Tracking System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "https://referral.gostaffify.com",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(clients.router, prefix="/api/clients", tags=["Clients"])
app.include_router(referrals.router, prefix="/api/referrals", tags=["Referrals"])
app.include_router(vas.router, tags=["Virtual Assistants"])
app.include_router(credits.router, prefix="/api/credits", tags=["Credits"])
app.include_router(hubstaff.router, tags=["Hubstaff"])
app.include_router(qbo.router, prefix="/api/qbo", tags=["QuickBooks Online"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Staffify Referral Portal"}
