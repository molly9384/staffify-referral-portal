import hashlib
import hmac
from datetime import date
from typing import Optional

import httpx

from config import settings

HUBSTAFF_API_BASE = "https://api.hubstaff.com/v2"


class HubstaffService:
    def __init__(self):
        self.token = settings.HUBSTAFF_API_TOKEN
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    async def get_project_members(self, project_id: str) -> list:
        url = f"{HUBSTAFF_API_BASE}/projects/{project_id}/members"
        async with httpx.AsyncClient(timeout=30) as client:
            response = client.get(url, headers=self.headers)
            response.raise_for_status()
            data = response.json()
            return data.get("members", [])

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
        async with httpx.AsyncClient(timeout=60) as client:
            while url:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                data = response.json()
                activities = data.get("daily_activities", [])
                all_activities.extend(activities)

                # Handle pagination
                pagination = data.get("pagination", {})
                next_link = pagination.get("next_link")
                if next_link:
                    url = next_link
                    params = {}  # params already encoded in next_link
                else:
                    break

        return all_activities

    async def get_projects(self, organization_id: str) -> list:
        """Fetch all projects for the org."""
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/projects"
        all_projects = []
        async with httpx.AsyncClient(timeout=30) as client:
            while url:
                response = await client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                projects = data.get("projects", [])
                for p in projects:
                    all_projects.append({
                        "id": str(p.get("id", "")),
                        "name": p.get("name", ""),
                        "status": p.get("status"),
                    })
                pagination = data.get("pagination", {})
                next_link = pagination.get("next_link")
                url = next_link if next_link else None
        return all_projects

    async def register_webhook(self, organization_id: str, target_url: str) -> dict:
        """
        POST /organizations/{id}/webhooks
        Register webhook for timer.start and timer.stop events.
        """
        url = f"{HUBSTAFF_API_BASE}/organizations/{organization_id}/webhooks"
        payload = {
            "event_type": ["timer.start", "timer.stop"],
            "target_url": target_url,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
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
