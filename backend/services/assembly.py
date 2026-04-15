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

# Cached member ID so we only fetch it once per process
_cached_member_id: str | None = None


def get_assembly_member_id(api_key: str) -> str | None:
    """
    Return the first active member ID from the Assembly workspace.
    Used as senderId for in-product notifications.
    Result is cached in memory for the lifetime of the process.
    """
    global _cached_member_id
    if _cached_member_id:
        return _cached_member_id
    try:
        response = httpx.get(
            f"{ASSEMBLY_API_BASE}/members",
            headers={"X-API-KEY": api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        members = data if isinstance(data, list) else data.get("data", [])
        if members:
            _cached_member_id = str(members[0].get("id") or members[0].get("memberId") or "")
            return _cached_member_id
    except Exception as e:
        print(f"Assembly: could not fetch member ID: {e}")
    return None


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


def send_assembly_notification(
    api_key: str,
    recipient_client_id: str,
    title: str,
    body: str | None = None,
    sender_member_id: str | None = None,
) -> bool:
    """
    Send an in-product notification to a client inside Assembly.
    sender_member_id is an internal member ID used as senderId (required by Assembly).
    If not provided, falls back to auto-fetching the first workspace member.
    Returns True on success, False on failure.
    """
    try:
        # Resolve senderId — must be an internal member ID, not a client ID
        sender_id = sender_member_id or get_assembly_member_id(api_key)
        if not sender_id:
            print("Assembly notification skipped: could not resolve a senderId (member ID)")
            return False

        payload = {
            "senderId": sender_id,
            "recipientClientId": recipient_client_id,
            "deliveryTargets": {
                "inProduct": {
                    "title": title,
                    **({"body": body} if body else {}),
                }
            },
        }
        response = httpx.post(
            f"{ASSEMBLY_API_BASE}/notifications",
            headers={
                "X-API-KEY": api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10.0,
        )
        if not response.is_success:
            print(f"Assembly notification failed [{response.status_code}]: {response.text}")
            return False
        return True
    except Exception as e:
        print(f"Assembly notification error: {e}")
        return False
