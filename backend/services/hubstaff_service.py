import hashlib
import hmac
import os
from datetime import date
from typing import Optional

import httpx

from config import settings

HUBSTAFF_API_BASE = "https://api.hubstaff.com/v2"
HUBSTAFF_TOKEN_URL = "https://account.hubstaff.com/access_tokens"
HUBSTAFF_AUTH_URL = "https://account.hubstaff.com/authorizations/new"


class HubstaffService:
    def __init__(self):
        # Prefer OAuth access token; fall back to PAT for read-only ops
        self.token = settings.HUBSTAFF_ACCESS_TOKEN or settings.HUBSTAFF_API_TOKEN
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def get_auth_url() -> str:
        """Generate the Hubstaff OAuth2 authorization URL."""
        from urllib.parse import urlencode
        import secrets
        params = {
            "response_type": "code",
            "client_id": settings.HUBSTAFF_CLIENT_ID,
            "redirect_uri": f"{settings.BASE_URL}/hubstaff/callback",
            "scope": "openid hubstaff:read hubstaff:write",
            "nonce": secrets.token_urlsafe(16),
        }
        return f"{HUBSTAFF_AUTH_URL}?{urlencode(params)}"

    @staticmethod
    async def exchange_code_for_tokens(code: str) -> dict:
        """Exchange authorization code for access + refresh tokens."""
        from urllib.parse import urlencode
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": f"{settings.BASE_URL}/hubstaff/callback",
            "client_id": settings.HUBSTAFF_CLIENT_ID,
            "client_secret": settings.HUBSTAFF_CLIENT_SECRET,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                HUBSTAFF_TOKEN_URL,
                content=urlencode(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
            )
            if not response.is_success:
                raise Exception(f"Token exchange failed ({response.status_code}): {response.text}")
            data = response.json()
            if "error" in data:
                raise Exception(f"Token exchange error: {data.get('error_description', data['error'])}")
            return data

    @staticmethod
    async def refresh_access_token() -> dict:
        """Use the refresh token to get a new access token and persist it to DB."""
        from urllib.parse import urlencode
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                HUBSTAFF_TOKEN_URL,
                content=urlencode({
                    "grant_type": "refresh_token",
                    "refresh_token": settings.HUBSTAFF_REFRESH_TOKEN,
                    "client_id": settings.HUBSTAFF_CLIENT_ID,
                    "client_secret": settings.HUBSTAFF_CLIENT_SECRET,
                }).encode("utf-8"),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            data = response.json()

        new_access = data.get("access_token", "")
        new_refresh = data.get("refresh_token", settings.HUBSTAFF_REFRESH_TOKEN)
        settings.HUBSTAFF_ACCESS_TOKEN = new_access
        settings.HUBSTAFF_REFRESH_TOKEN = new_refresh

        # Persist to DB so tokens survive restarts
        try:
            from database import AsyncSessionLocal
            from models import SystemConfig
            async with AsyncSessionLocal() as db:
                for key, value in [
                    ("HUBSTAFF_ACCESS_TOKEN", new_access),
                    ("HUBSTAFF_REFRESH_TOKEN", new_refresh),
                ]:
                    existing = await db.get(SystemConfig, key)
                    if existing:
                        existing.value = value
                    else:
                        db.add(SystemConfig(key=key, value=value))
                await db.commit()
        except Exception as e:
            print(f"Warning: could not persist refreshed Hubstaff tokens: {e}")

        return data

    async def _make_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Make a Hubstaff API request, auto-refreshing the token on 401."""
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            response = await client.request(method, url, headers=self.headers, **kwargs)
            if response.status_code == 401:
                # Token expired — refresh and retry once
                await self.refresh_access_token()
                self.token = settings.HUBSTAFF_ACCESS_TOKEN
                self.headers["Authorization"] = f"Bearer {self.token}"
                response = await client.request(method, url, headers=self.headers, **kwargs)
            response.raise_for_status()
            return response

    @staticmethod
    def is_connected() -> bool:
        """Check if we have a valid OAuth access token."""
        return bool(settings.HUBSTAFF_ACCESS_TOKEN or settings.HUBSTAFF_API_TOKEN)

    async def get_project_members(self, project_id: str) -> list:
        url = f"{HUBSTAFF_API_BASE}/projects/{project_id}/members"
        response = await self._make_request("GET", url, params={"include[]": "users"})
        data = response.json()
        members = data.get("members", [])
        users_by_id = {str(u["id"]): u for u in data.get("users", []) if u.get("id")}
        for m in members:
            uid = str(m.get("user_id", ""))
            if uid and uid in users_by_id and not m.get("user"):
                m["user"] = users_by_id[uid]
        print(f"[DEBUG project-members] project {project_id} members sample: {members[:2]}")
        return members

    async def get_activities(
        self,
        organization_id: str,
        project_id: str,
        start_date: date,
        end_date: date,
        user_id: Optional[str] = None,
    ) -> list:
        """
        GET /organizations/{id}/activities/daily
        Returns daily activity summaries with tracked seconds per user.
        """
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/activities/daily"
        params = {
            "date[start]": start_date.isoformat(),
            "date[stop]": end_date.isoformat(),
            "project_ids": project_id,
        }
        if user_id:
            params["user_ids"] = user_id

        all_activities = []
        first = True
        while url:
            response = await self._make_request("GET", url, params=params if first else {})
            first = False
            data = response.json()
            all_activities.extend(data.get("daily_activities", []))
            next_link = data.get("pagination", {}).get("next_link")
            url = next_link if next_link else None

        return all_activities

    async def get_organization_members(self, organization_id: str) -> list:
        """Fetch all members (users) for the organization."""
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/members"
        all_members = []
        first = True
        while url:
            params = {"include[]": "users"} if first else {}
            response = await self._make_request("GET", url, params=params)
            first = False
            data = response.json()
            members = data.get("members", [])
            # Merge embedded users by user_id so name is available on each member
            users_by_id = {str(u["id"]): u for u in data.get("users", []) if u.get("id")}
            for m in members:
                uid = str(m.get("user_id", ""))
                if uid and uid in users_by_id and not m.get("user"):
                    m["user"] = users_by_id[uid]
            all_members.extend(members)
            print(f"[DEBUG org-members] page members sample: {members[:2]}")
            url = data.get("pagination", {}).get("next_link")
        return all_members

    async def get_projects(self, organization_id: str) -> list:
        """Fetch all projects for the org."""
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/projects"
        all_projects = []
        while url:
            response = await self._make_request("GET", url)
            data = response.json()
            for p in data.get("projects", []):
                all_projects.append({
                    "id": str(p.get("id", "")),
                    "name": p.get("name", ""),
                    "status": p.get("status"),
                })
            url = data.get("pagination", {}).get("next_link")
        return all_projects

    async def get_invoices(self, organization_id: str, project_id: Optional[str] = None, client_name: Optional[str] = None) -> list:
        """
        Fetch all client invoices for the organization.
        Hubstaff client invoices are not filterable by project_id via the API —
        they are matched by client name after fetching.
        """
        # Try client_invoices endpoint first (Hubstaff v2 uses this for client-facing invoices)
        for endpoint in ["client_invoices", "invoices"]:
            url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/{endpoint}"
            params: dict = {"page_size": 100}
            all_invoices = []
            first = True
            found = False
            while url:
                try:
                    response = await self._make_request("GET", url, params=params if first else {})
                    found = True
                except Exception as e:
                    if "404" in str(e) or "405" in str(e):
                        print(f"[DEBUG invoices] {endpoint} returned error — trying next")
                        break
                    raise
                first = False
                data = response.json()
                # Hubstaff returns 'client_invoices' or 'invoices' depending on endpoint
                invoices = data.get("client_invoices") or data.get("invoices", [])
                print(f"[DEBUG invoices] {endpoint}: fetched {len(invoices)} invoices, keys={list(data.keys())}")
                all_invoices.extend(invoices)
                next_link = data.get("pagination", {}).get("next_link")
                if next_link:
                    url = next_link
                else:
                    break
            if found and all_invoices:
                break

        # Filter by client name if provided
        if client_name:
            name_lower = client_name.strip().lower()
            filtered = [
                inv for inv in all_invoices
                if inv.get("client_name", "").strip().lower() == name_lower
            ]
            print(f"[DEBUG invoices] filtered to {len(filtered)} invoices for client '{client_name}'")
            return filtered

        return all_invoices

    async def get_invoice(self, invoice_id: str) -> dict:
        """Fetch a single invoice with full line item details."""
        url = f"{HUBSTAFF_API_BASE}/invoices/{invoice_id}"
        response = await self._make_request("GET", url)
        data = response.json()
        return data.get("invoice", data)

    async def register_webhook(self, organization_id: str, target_url: str) -> dict:
        """
        POST /organizations/{id}/webhooks
        Register webhook for timer.start and timer.stop events.
        """
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/webhooks"
        payload = {
            "events": ["timer.start", "timer.stop"],
            "target_url": target_url,
        }
        response = await self._make_request("POST", url, json=payload)
        return response.json()

    @staticmethod
    def verify_webhook_secret(x_hook_secret: str) -> str:
        """For verification requests, echo back the X-Hook-Secret."""
        return x_hook_secret

    @staticmethod
    def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
        """Verify HMAC-SHA256 signature from Hubstaff webhook."""
        expected = hmac.new(
            secret.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(f"sha256={expected}", signature)

    async def get_tracked_seconds_for_user(
        self,
        organization_id: str,
        project_id: str,
        user_id: str,
        start_date: date,
        end_date: date,
    ) -> float:
        """Get total tracked seconds for a specific user in a date range."""
        activities = await self.get_activities(
            organization_id=organization_id,
            project_id=project_id,
            start_date=start_date,
            end_date=end_date,
            user_id=user_id,
        )
        total_seconds = sum(a.get("tracked", 0) for a in activities)
        return total_seconds
