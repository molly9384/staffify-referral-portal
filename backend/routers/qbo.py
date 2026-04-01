from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from config import settings
from database import get_db
from models import User
from schemas import MessageResponse

router = APIRouter()


@router.get("/auth")
async def qbo_auth():
    """Redirect admin to QBO OAuth authorization page."""
    try:
        from services.qbo_service import QBOService
        service = QBOService()
        auth_url = service.get_auth_url()
        return RedirectResponse(url=auth_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build QBO auth URL: {str(e)}")


@router.get("/callback")
async def qbo_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle OAuth callback from QBO. Exchanges code for tokens and persists to DB."""
    code = request.query_params.get("code")
    realm_id = request.query_params.get("realmId")
    error = request.query_params.get("error")

    if error:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/internal/settings?qbo_error={error}"
        )

    if not code or not realm_id:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/internal/settings?qbo_error=Missing+code+or+realmId"
        )

    try:
        from services.qbo_service import QBOService
        from models import SystemConfig
        service = QBOService()
        tokens = await service.exchange_code_for_tokens(code, realm_id)

        # Persist tokens to DB so they survive restarts and multi-worker deployments
        for key, value in [
            ("QBO_ACCESS_TOKEN", tokens.get("access_token", "")),
            ("QBO_REFRESH_TOKEN", tokens.get("refresh_token", "")),
            ("QBO_REALM_ID", realm_id),
        ]:
            if value:
                existing = await db.get(SystemConfig, key)
                if existing:
                    existing.value = value
                else:
                    db.add(SystemConfig(key=key, value=value))
        await db.commit()

        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/internal/settings?qbo_connected=true"
        )
    except Exception as e:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/internal/settings?qbo_error={str(e)}"
        )


@router.get("/status")
async def qbo_status(current_user: User = Depends(require_admin)):
    try:
        from services.qbo_service import QBOService
        service = QBOService()
        is_connected = service.is_connected()
        return {
            "connected": is_connected,
            "realm_id": settings.QBO_REALM_ID if is_connected else None,
            "environment": settings.QBO_ENVIRONMENT,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check QBO status: {str(e)}")
