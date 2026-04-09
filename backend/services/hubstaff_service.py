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

    async def get_invoices(self, organization_id: str, project_id: Optional[str] = None, client_name: Optional[str] = None, include_all_statuses: bool = False) -> list:
        """
        Fetch client invoices for the organization, matched by client_id.
        By default only returns non-paid/non-closed invoices (for credit generation).
        Pass include_all_statuses=True to get every invoice regardless of status
        (used when checking whether a pending invoice has since been paid).
        Line items are included via include_line_items=true.
        """
        # Resolve client_id first
        hubstaff_client_id = None
        if client_name:
            hubstaff_client_id = await self._get_hubstaff_client_id(organization_id, client_name)
            print(f"[DEBUG invoices] resolved client_id={hubstaff_client_id} for '{client_name}'")
            if not hubstaff_client_id:
                return []

        # Fetch invoices filtered by client_id, with line items included
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/client_invoices"
        params: dict = {
            "page_size": 100,
            "client_ids[]": hubstaff_client_id,
            "include_line_items": "true",
        }
        all_invoices = []
        while url:
            try:
                response = await self._make_request("GET", url, params=params)
            except Exception as e:
                if "404" in str(e):
                    return []
                raise
            params = {}
            data = response.json()
            page = data.get("client_invoices") or data.get("invoices", [])
            all_invoices.extend(page)
            print(f"[DEBUG invoices] page fetched {len(page)} invoices, total so far: {len(all_invoices)}")
            url = data.get("pagination", {}).get("next_link")

        print(f"[DEBUG invoices] fetched {len(all_invoices)} total invoices")

        if include_all_statuses:
            return all_invoices

        # Filter to non-closed/non-paid status (for new credit generation)
        closed_statuses = {"closed", "paid", "cancelled", "canceled", "void", "voided"}
        matched = [inv for inv in all_invoices if (inv.get("status") or "").lower() not in closed_statuses]

        print(f"[DEBUG invoices] {len(matched)} open/draft invoices for '{client_name}'")
        for inv in matched:
            print(f"[DEBUG invoice] id={inv.get('id')} status={inv.get('status')} number={inv.get('number')} line_items={inv.get('line_items', [])}")

        return matched

    async def _get_hubstaff_client_id(self, organization_id: str, client_name: str) -> Optional[str]:
        """Find a Hubstaff client_id by matching client name."""
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/clients"
        try:
            response = await self._make_request("GET", url)
            data = response.json()
            clients = data.get("clients", [])
            name_lower = client_name.strip().lower()
            print(f"[DEBUG clients] found {len(clients)} Hubstaff clients")
            for c in clients:
                c_name = (c.get("name") or c.get("display_name") or "").strip().lower()
                if c_name == name_lower or c_name.startswith(name_lower.split()[0]):
                    print(f"[DEBUG clients] matched '{c.get('name')}' id={c.get('id')}")
                    return str(c.get("id", ""))
        except Exception as e:
            print(f"[DEBUG clients] error fetching clients: {e}")
        return None

    async def get_invoice(self, invoice_id: str, organization_id: Optional[str] = None) -> dict:
        """
        Fetch a single client invoice with full line item details.
        Hubstaff has no GET-by-ID endpoint for client invoices; we fetch the list
        with include_line_items=true and match by id.
        organization_id is required.
        """
        if not organization_id:
            return {}
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/client_invoices"
        params = {"include_line_items": "true", "page_size": 100}
        while url:
            try:
                response = await self._make_request("GET", url, params=params)
            except Exception:
                return {}
            params = {}
            data = response.json()
            for inv in data.get("client_invoices", []):
                if str(inv.get("id", "")) == str(invoice_id):
                    return inv
            url = data.get("pagination", {}).get("next_link")
        return {}

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
