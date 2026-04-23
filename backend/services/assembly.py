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

import hmac as hmac_module
import hashlib
import json
import httpx
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

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


async def get_all_assembly_clients(api_key: str) -> list:
    """
    Fetch all Assembly clients (paginated).
    Returns a list of dicts with: id, givenName, familyName, companyId, etc.
    """
    all_clients = []
    url = f"{ASSEMBLY_API_BASE}/clients"
    params: dict = {"limit": 500}

    async with httpx.AsyncClient(timeout=30.0) as client:
        while url:
            response = await client.get(
                url,
                headers={"X-API-KEY": api_key},
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            all_clients.extend(data.get("data", []))
            cursor = data.get("nextCursor") or data.get("pageInfo", {}).get("cursor")
            if cursor:
                params = {"limit": 500, "cursor": cursor}
            else:
                url = None

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


