import json
import secrets
import urllib.parse
from typing import Optional

import httpx

from config import settings

QBO_SANDBOX_DISCOVERY = "https://developer.api.intuit.com/.well-known/openid_sandbox_configuration"
QBO_PROD_DISCOVERY = "https://developer.api.intuit.com/.well-known/openid_configuration"
QBO_SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com/v3/company"
QBO_PROD_BASE = "https://quickbooks.api.intuit.com/v3/company"


class QBOService:
    def __init__(self):
        self.client_id = settings.QBO_CLIENT_ID
        self.client_secret = settings.QBO_CLIENT_SECRET
        self.redirect_uri = settings.QBO_REDIRECT_URI
        self.realm_id = settings.QBO_REALM_ID
        self.access_token = settings.QBO_ACCESS_TOKEN
        self.refresh_token = settings.QBO_REFRESH_TOKEN
        self.environment = settings.QBO_ENVIRONMENT
        self.base_url = QBO_SANDBOX_BASE if self.environment == "sandbox" else QBO_PROD_BASE

    def is_connected(self) -> bool:
        return bool(self.realm_id and self.access_token)

    def get_auth_url(self) -> str:
        scope = "com.intuit.quickbooks.accounting"
        state = secrets.token_urlsafe(16)
        auth_endpoint = (
            "https://appcenter.intuit.com/connect/oauth2"
        )
        params = {
            "client_id": self.client_id,
            "scope": scope,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "state": state,
        }
        return f"{auth_endpoint}?{urllib.parse.urlencode(params)}"

    async def exchange_code_for_tokens(self, code: str, realm_id: str) -> dict:
        """Exchange auth code for access and refresh tokens."""
        token_url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                token_url,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                },
                auth=(self.client_id, self.client_secret),
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            tokens = response.json()

        # In production, store these in the database or a secure config store.
        # Here we update settings at runtime (tokens will need to be persisted
        # to .env or a database table for them to survive restarts).
        settings.QBO_ACCESS_TOKEN = tokens.get("access_token", "")
        settings.QBO_REFRESH_TOKEN = tokens.get("refresh_token", "")
        settings.QBO_REALM_ID = realm_id
        self.access_token = settings.QBO_ACCESS_TOKEN
        self.refresh_token = settings.QBO_REFRESH_TOKEN
        self.realm_id = realm_id
        return tokens

    async def refresh_access_token(self) -> str:
        """Refresh the QBO access token using the refresh token and persist to DB."""
        token_url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                token_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self.refresh_token,
                },
                auth=(self.client_id, self.client_secret),
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            tokens = response.json()

        new_access = tokens.get("access_token", "")
        new_refresh = tokens.get("refresh_token", self.refresh_token)

        settings.QBO_ACCESS_TOKEN = new_access
        settings.QBO_REFRESH_TOKEN = new_refresh
        self.access_token = new_access
        self.refresh_token = new_refresh

        # Persist to DB so tokens survive restarts (QBO refresh tokens rotate on every use)
        try:
            from database import AsyncSessionLocal
            from models import SystemConfig
            async with AsyncSessionLocal() as db:
                for key, value in [
                    ("QBO_ACCESS_TOKEN", new_access),
                    ("QBO_REFRESH_TOKEN", new_refresh),
                ]:
                    existing = await db.get(SystemConfig, key)
                    if existing:
                        existing.value = value
                    else:
                        db.add(SystemConfig(key=key, value=value))
                await db.commit()
        except Exception as e:
            print(f"Warning: could not persist refreshed QBO tokens: {e}")

        return new_access

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def _make_request(self, method: str, url: str, **kwargs) -> dict:
        """Make a request, refreshing the token if needed."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(method, url, headers=self._get_headers(), **kwargs)
            if response.status_code == 401:
                # Token expired, refresh and retry
                await self.refresh_access_token()
                response = await client.request(method, url, headers=self._get_headers(), **kwargs)
            if not response.is_success:
                print(f"[DEBUG QBO] {method} {url} → {response.status_code}: {response.text[:500]}")
            response.raise_for_status()
            return response.json()

    async def find_customer_by_name(self, display_name: str) -> Optional[dict]:
        """Look up a QBO customer by DisplayName. Returns id, display_name, email or None."""
        if not self.realm_id:
            raise ValueError("QBO not connected: no realm_id")
        url = f"{self.base_url}/{self.realm_id}/query"

        def _extract(c):
            email = c.get("PrimaryEmailAddr", {}).get("Address", "") if c.get("PrimaryEmailAddr") else ""
            return {"id": str(c.get("Id", "")), "display_name": c.get("DisplayName", ""), "email": email}

        # Try exact match first
        safe_name = display_name.strip().replace("'", "\\'")
        query = f"SELECT * FROM Customer WHERE DisplayName = '{safe_name}' MAXRESULTS 1"
        data = await self._make_request("GET", url, params={"query": query, "minorversion": "65"})
        customers = data.get("QueryResponse", {}).get("Customer", [])
        if customers:
            return _extract(customers[0])

        # Fallback: case-insensitive scan of all customers
        print(f"[DEBUG QBO] Exact match failed for '{display_name}', trying case-insensitive scan")
        name_lower = display_name.strip().lower()
        all_data = await self._make_request("GET", url, params={"query": "SELECT * FROM Customer MAXRESULTS 1000", "minorversion": "65"})
        for c in all_data.get("QueryResponse", {}).get("Customer", []):
            if c.get("DisplayName", "").strip().lower() == name_lower:
                return _extract(c)
        return None

    async def get_customer_invoices(self, customer_id: str, status: str = "Paid") -> list:
        """Get invoices for a customer filtered by status."""
        if not self.realm_id:
            raise ValueError("QBO not connected: no realm_id")
        query = f"SELECT * FROM Invoice WHERE CustomerRef = '{customer_id}' AND TxnStatus = '{status}' MAXRESULTS 100"
        url = f"{self.base_url}/{self.realm_id}/query"
        data = await self._make_request("GET", url, params={"query": query, "minorversion": "65"})
        query_response = data.get("QueryResponse", {})
        return query_response.get("Invoice", [])

    async def get_unpaid_invoices(self, customer_id: str) -> list:
        """Get open (unpaid) invoices for a customer."""
        if not self.realm_id:
            raise ValueError("QBO not connected: no realm_id")
        query = f"SELECT * FROM Invoice WHERE CustomerRef = '{customer_id}' AND Balance > '0' MAXRESULTS 100"
        url = f"{self.base_url}/{self.realm_id}/query"
        data = await self._make_request("GET", url, params={"query": query, "minorversion": "65"})
        query_response = data.get("QueryResponse", {})
        return query_response.get("Invoice", [])

    async def get_invoice(self, invoice_id: str) -> dict:
        """Get a single invoice by ID."""
        if not self.realm_id:
            raise ValueError("QBO not connected: no realm_id")
        url = f"{self.base_url}/{self.realm_id}/invoice/{invoice_id}"
        data = await self._make_request("GET", url, params={"minorversion": "65"})
        return data.get("Invoice", {})

    async def get_or_create_referral_credit_item(self) -> str:
        """Find the 'Referral Credit' service item in QBO, creating it if needed. Returns item ID."""
        url = f"{self.base_url}/{self.realm_id}/query"

        # Check if it already exists
        data = await self._make_request("GET", url, params={
            "query": "SELECT * FROM Item WHERE Name = 'Referral Credit' MAXRESULTS 1",
            "minorversion": "65",
        })
        items = data.get("QueryResponse", {}).get("Item", [])
        if items:
            return str(items[0].get("Id"))

        # Need an income account to create the item — grab the first one
        acct_data = await self._make_request("GET", url, params={
            "query": "SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1",
            "minorversion": "65",
        })
        accounts = acct_data.get("QueryResponse", {}).get("Account", [])
        if not accounts:
            raise ValueError("No income accounts found in QBO — cannot create Referral Credit item")

        acct = accounts[0]
        create_url = f"{self.base_url}/{self.realm_id}/item"
        item_data = await self._make_request("POST", create_url, json={
            "Name": "Referral Credit",
            "Type": "Service",
            "IncomeAccountRef": {"value": str(acct.get("Id")), "name": acct.get("Name", "")},
        }, params={"minorversion": "65"})

        return str(item_data.get("Item", {}).get("Id"))

    async def apply_credit_to_invoice(
        self,
        invoice_id: str,
        credit_amount: float,
        description: str,
    ) -> dict:
        """
        Apply a referral credit as a named negative line item on an invoice.
        Uses the 'Referral Credit' service item so it appears clearly on the invoice.
        """
        if not self.realm_id:
            raise ValueError("QBO not connected: no realm_id")

        item_id = await self.get_or_create_referral_credit_item()

        # Fetch the current invoice to get SyncToken (required for updates)
        invoice = await self.get_invoice(invoice_id)
        sync_token = invoice.get("SyncToken", "0")
        existing_lines = invoice.get("Line", [])

        # Negative unit price so it reduces the invoice total
        credit_line = {
            "Amount": -abs(credit_amount),
            "DetailType": "SalesItemLineDetail",
            "Description": description,
            "SalesItemLineDetail": {
                "ItemRef": {"value": item_id, "name": "Referral Credit"},
                "Qty": 1,
                "UnitPrice": -abs(credit_amount),
            },
        }

        # Append credit line to existing lines
        updated_lines = existing_lines + [credit_line]

        update_payload = {
            "sparse": True,
            "Id": invoice_id,
            "SyncToken": sync_token,
            "Line": updated_lines,
        }

        url = f"{self.base_url}/{self.realm_id}/invoice"
        data = await self._make_request("POST", url, json=update_payload, params={"minorversion": "65"})
        return data.get("Invoice", {})
