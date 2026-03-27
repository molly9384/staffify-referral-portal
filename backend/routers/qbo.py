from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from auth import require_admin
from config import settings
from models import User
from schemas import MessageResponse

router = APIRouter()


@router.get("/auth")
async def qbo_auth(current_user: User = Depends(require_admin)):
    try:
        from services.qbo_service import QBOService
        service = QBOService()
        auth_url = service.get_auth_url()
        return RedirectResponse(url=auth_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build QBO auth URL: {str(e)}")


@router.get("/callback")
async def qbo_callback(request: Request):
    code = request.query_params.get("code")
    realm_id = request.query_params.get("realmId")
    error = request.query_params.get("error")

    if error:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/internal/dashboard?qbo_error={error}"
        )

    if not code or not realm_id:
        raise HTTPException(status_code=400, detail="Missing code or realmId from QBO callback")

    try:
        from services.qbo_service import QBOService
        service = QBOService()
        await service.exchange_code_for_tokens(code, realm_id)
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/internal/dashboard?qbo_connected=true"
        )
    except Exception as e:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/internal/dashboard?qbo_error={str(e)}"
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
