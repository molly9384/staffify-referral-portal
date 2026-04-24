"""
Assembly iFrame token decryption and API helpers.

Assembly passes an AES-128 CBC encrypted token as a URL query param (?token=...)
when a client opens a Custom App inside the portal. This module replicates
the decryption logic from the official copilot-node-sdk in Python.

Encryption details (from SDK source):
  - Key:    HMAC-SHA256(key=api_key, msg=''), first 32 hex chars (16 bytes)
  - Token:  hex string = [16-byte IV] + [ciphertext]
  - Cipher: AES-128-CBC with PKCS7 padding
  - Output: UTF-8 JSON string
"""

import asyncio
import hmac as hmac_module
import hashlib
import json
import logging
import time
import httpx
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-process cache for Assembly clients list
# ---------------------------------------------------------------------------
# Assembly rate-limits GET /clients aggressively.  Multiple concurrent callers
# (VA sync job + multiple widget requests) were each making independent calls
# and collectively blowing past the limit.
#
# Solution: a single shared cache (TTL = 15 min) + an asyncio lock so only ONE
# coroutine ever calls Assembly at a time.  All others wait then read the cache.
# ---------------------------------------------------------------------------

_clients_cache: list | None = None
_clients_cache_time: float = 0.0
_CLIENTS_CACHE_TTL: float = 3600.0  # 1 hour — matches VA sync interval
_clients_lock: asyncio.Lock | None = None  # lazy-init: must be created inside a running loop


def _get_clients_lock() -> asyncio.Lock:
    """Return the module-level asyncio.Lock, creating it on first use."""
    global _clients_lock
    if _clients_lock is None:
        _clients_lock = asyncio.Lock()
    return _clients_lock


def get_cached_assembly_clients() -> list | None:
    """
    Return the cached Assembly clients list if it has ever been populated,
    regardless of whether the cache is fresh or stale.  Returns None only
    if get_all_assembly_clients has never completed successfully.

    Safe to call from the widget — never triggers an API call.
    """
    return _clients_cache

ASSEMBLY_API_BASE = "https://api.assembly.com/v1"


def _generate_128_bit_key(api_key: str) -> bytes:
    """
    Derive a 128-bit AES key from the Assembly API key.
    Matches: crypto.createHmac('sha256', apiKey).digest('hex').slice(0, 32)
    """
    digest = hmac_module.new(
        api_key.encode("utf-8"),
        b"",  # empty message — matches Node's .digest() without .update()
        hashlib.sha256,
    ).hexdigest()
    return bytes.fromhex(digest[:32])  # first 32 hex chars = 16 bytes


def decrypt_assembly_token(api_key: str, encrypted_token: str) -> dict:
    """
    Decrypt an Assembly iFrame session token and return the payload dict.

    Expected payload fields:
      - workspaceId (always present)
      - clientId (present when a client is viewing the app)
      - companyId (optional)
      - internalUserId (present when an internal user is viewing)

    Raises ValueError if decryption or JSON parsing fails.
    """
    try:
        key = _generate_128_bit_key(api_key)
        token_bytes = bytes.fromhex(encrypted_token)

        iv = token_bytes[:16]
        ciphertext = token_bytes[16:]

        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()

        unpadder = padding.PKCS7(128).unpadder()
        plaintext = unpadder.update(padded_plaintext) + unpadder.finalize()

        payload = json.loads(plaintext.decode("utf-8"))

        if "workspaceId" not in payload:
            raise ValueError("Decrypted token missing required workspaceId field")

        return payload

    except (ValueError, KeyError) as e:
        raise ValueError(f"Failed to decrypt Assembly token: {e}")
    except Exception as e:
        raise ValueError(f"Unexpected error decrypting Assembly token: {e}")


def get_assembly_client(api_key: str, client_id: str) -> dict:
    """
    Fetch a client's details from the Assembly API by their Assembly client ID.

    Returns dict with: id, givenName, familyName, email, companyIds, etc.
    Raises ValueError if the client is not found.
    """
    response = httpx.get(
        f"{ASSEMBLY_API_BASE}/clients/{client_id}",
        headers={"X-API-KEY": api_key},
        timeout=10.0,
    )
    if response.status_code == 404:
        raise ValueError(f"Assembly client '{client_id}' not found")
    response.raise_for_status()
    return response.json()


# The custom field key for "Current VA(s)" in your Assembly workspace.
# If this needs to be updated, check Assembly → Settings → Custom Fields.
ASSEMBLY_VA_FIELD_KEY = "currentVas"


async def get_all_assembly_clients(api_key: str, max_retries: int = 3) -> list:
    """
    Fetch all Assembly clients (paginated), with a 15-minute in-process cache.

    Only one coroutine calls Assembly at a time (asyncio.Lock).  All concurrent
    callers wait for that single fetch to complete, then share the cached result.
    This prevents the pile-on of parallel 429 errors that occurred when the VA
    sync job and multiple widget requests each made independent calls.

    Retries up to max_retries times on 429 with exponential backoff (5s/10s/20s).
    """
    global _clients_cache, _clients_cache_time

    # Fast path: return cached result without touching the lock
    if _clients_cache is not None and (time.monotonic() - _clients_cache_time) < _CLIENTS_CACHE_TTL:
        return _clients_cache

    # Serialize: only one coroutine fetches at a time
    async with _get_clients_lock():
        # Re-check after acquiring lock — another coroutine may have refreshed the cache
        # while we were waiting
        if _clients_cache is not None and (time.monotonic() - _clients_cache_time) < _CLIENTS_CACHE_TTL:
            return _clients_cache

        logger.info("Assembly clients cache miss — fetching from API")
        all_clients: list = []
        url: str | None = f"{ASSEMBLY_API_BASE}/clients"
        params: dict = {"limit": 500}

        async with httpx.AsyncClient(timeout=30.0) as client:
            while url:
                last_exc = None
                for attempt in range(max_retries):
                    response = await client.get(
                        url,
                        headers={"X-API-KEY": api_key},
                        params=params,
                    )
                    if response.status_code == 429:
                        retry_after = response.headers.get("Retry-After") or response.headers.get("X-RateLimit-Reset")
                        wait = 5 * (2 ** attempt)  # 5s → 10s → 20s
                        logger.warning(
                            f"Assembly GET /clients returned 429 — "
                            f"retrying in {wait}s (attempt {attempt + 1}/{max_retries})"
                            + (f" | Retry-After: {retry_after}" if retry_after else " | No Retry-After header")
                        )
                        await asyncio.sleep(wait)
                        last_exc = httpx.HTTPStatusError(
                            "429 Too Many Requests",
                            request=response.request,
                            response=response,
                        )
                        continue
                    response.raise_for_status()
                    last_exc = None
                    break
                else:
                    raise last_exc  # type: ignore[misc]

                data = response.json()
                all_clients.extend(data.get("data", []))
                cursor = data.get("nextCursor") or data.get("pageInfo", {}).get("cursor")
                if cursor:
                    params = {"limit": 500, "cursor": cursor}
                else:
                    url = None

        _clients_cache = all_clients
        _clients_cache_time = time.monotonic()
        logger.info(f"Assembly clients cache populated — {len(all_clients)} clients")
        return all_clients


async def update_company_vas(api_key: str, company_id: str, va_value: str) -> dict:
    """
    Update the 'Current VA(s)' custom field on an Assembly company record.
    va_value examples: "Jane Smith, John Doe" | "*Sourcing Replacement*" | "*New Client - Sourcing*"
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.patch(
            f"{ASSEMBLY_API_BASE}/companies/{company_id}",
            headers={
                "X-API-KEY": api_key,
                "Content-Type": "application/json",
            },
            json={"customFields": {ASSEMBLY_VA_FIELD_KEY: va_value}},
        )
        response.raise_for_status()
        return response.json()


