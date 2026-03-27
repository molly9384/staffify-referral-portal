from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import engine, Base
from routers import auth, clients, referrals, vas, credits, hubstaff, qbo


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables if they don't exist (dev convenience; use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="Staffify Referral Portal API",
    description="Backend API for the Staffify Referral Tracking System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
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


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Staffify Referral Portal"}
