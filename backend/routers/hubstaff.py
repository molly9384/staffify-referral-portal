import hashlib
import hmac
import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import require_admin
from config import settings
from database import get_db
from models import HubstaffEvent, VirtualAssistant, User
from schemas import HubstaffProjectOut, MessageResponse

router = APIRouter()


@router.get("/hubstaff/connect")
async def hubstaff_connect():
    """Redirect admin to Hubstaff OAuth authorization page."""
    from services.hubstaff_service import HubstaffService
    auth_url = HubstaffService.get_auth_url()
    return RedirectResponse(url=auth_url)


@router.get("/hubstaff/callback")
async def hubstaff_callback(code: str = None, error: str = None, db: AsyncSession = Depends(get_db)):
    """Handle OAuth callback from Hubstaff. Exchanges code for tokens and persists to DB."""
    if error:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/internal/settings?hubstaff_error={error}"
        )
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received")

    try:
        from services.hubstaff_service import HubstaffService
        from models import SystemConfig
        tokens = await HubstaffService.exchange_code_for_tokens(code)
        access_token = tokens.get("access_token", "")
        refresh_token = tokens.get("refresh_token", "")

        if not access_token:
            raise HTTPException(status_code=400, detail="No access token in response")

        # Persist tokens to database so they survive restarts and multi-worker deployments
        for key, value in [
            ("HUBSTAFF_ACCESS_TOKEN", access_token),
            ("HUBSTAFF_REFRESH_TOKEN", refresh_token),
        ]:
            existing = await db.get(SystemConfig, key)
            if existing:
                existing.value = value
            else:
                db.add(SystemConfig(key=key, value=value))
        await db.commit()

        # Also update in-memory settings for the current process
        settings.HUBSTAFF_ACCESS_TOKEN = access_token
        settings.HUBSTAFF_REFRESH_TOKEN = refresh_token

        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/internal/settings?hubstaff_connected=true"
        )
    except Exception as e:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/internal/settings?hubstaff_error={str(e)}"
        )


@router.get("/api/hubstaff/status")
async def hubstaff_status(current_user: User = Depends(require_admin)):
    """Check if Hubstaff OAuth is connected."""
    from services.hubstaff_service import HubstaffService
    connected = HubstaffService.is_connected()
    return {
        "connected": connected,
        "has_oauth_token": bool(settings.HUBSTAFF_ACCESS_TOKEN),
        "has_pat": bool(settings.HUBSTAFF_API_TOKEN),
    }


@router.post("/webhooks/hubstaff", include_in_schema=False)
async def hubstaff_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # Hubstaff webhook verification: if X-Hook-Secret header present with empty/no body
    x_hook_secret = request.headers.get("X-Hook-Secret")
    body = await request.body()

    if x_hook_secret and (not body or body.strip() == b""):
        # Verification request — echo the secret back
        return Response(
            content="",
            status_code=200,
            headers={"X-Hook-Secret": x_hook_secret},
        )

    # Verify signature for actual events
    x_hook_signature = request.headers.get("X-Hook-Signature")
    if settings.HUBSTAFF_WEBHOOK_SECRET and x_hook_signature:
        expected = hmac.new(
            settings.HUBSTAFF_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(f"sha256={expected}", x_hook_signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Extract event data
    event_type = payload.get("event", "unknown")
    user_data = payload.get("user", {})
    project_data = payload.get("project", {})
    timer_data = payload.get("timer", {})

    hubstaff_user_id = str(user_data.get("id", ""))
    hubstaff_user_name = user_data.get("name", "Unknown")
    project_id = str(project_data.get("id", ""))
    project_name = project_data.get("name", "Unknown")

    tracking_started_at = None
    if timer_data.get("started_at"):
        try:
            tracking_started_at = datetime.fromisoformat(timer_data["started_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            pass

    event = HubstaffEvent(
        event_type=event_type,
        hubstaff_user_id=hubstaff_user_id,
        hubstaff_user_name=hubstaff_user_name,
        project_id=project_id,
        project_name=project_name,
        tracking_started_at=tracking_started_at,
        raw_payload=payload,
        processed=False,
    )
    db.add(event)

    # Check if this user_id matches any eligible VA and mark event processed
    if hubstaff_user_id:
        va_result = await db.execute(
            select(VirtualAssistant).where(
                VirtualAssistant.hubstaff_user_id == hubstaff_user_id,
                VirtualAssistant.is_eligible == True,
                VirtualAssistant.is_active == True,
            )
        )
        matching_va = va_result.scalar_one_or_none()
        if matching_va:
            event.processed = True

    await db.flush()
    return Response(content='{"status":"received"}', status_code=200, media_type="application/json")


@router.post("/api/hubstaff/register-webhook", response_model=MessageResponse)
async def register_hubstaff_webhook(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    try:
        from services.hubstaff_service import HubstaffService
        service = HubstaffService()
        target_url = f"{settings.BASE_URL}/webhooks/hubstaff"
        result = await service.register_webhook(settings.HUBSTAFF_ORG_ID, target_url)
        return MessageResponse(
            message="Webhook registered successfully",
            detail=f"Webhook ID: {result.get('id', 'N/A')}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register webhook: {str(e)}")


@router.get("/api/hubstaff/projects", response_model=List[HubstaffProjectOut])
async def list_hubstaff_projects(
    current_user: User = Depends(require_admin),
):
    try:
        from services.hubstaff_service import HubstaffService
        service = HubstaffService()
        projects = await service.get_projects(settings.HUBSTAFF_ORG_ID)
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")
