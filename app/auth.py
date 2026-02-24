#!/usr/bin/env python3
"""
Dashboard authentication — defense-in-depth.

Three auth modes checked in order:
1. Localhost bypass — requests from 127.0.0.1 / ::1 always allowed
2. Cloudflare Access JWT — validates exp + aud claims from Cf-Access-Jwt-Assertion header
3. Bearer token fallback — checks Authorization: Bearer <token> against DASHBOARD_TOKEN env var
4. No auth configured — if neither CF_POLICY_AUD nor DASHBOARD_TOKEN is set, allow all (backward compat)

/health is always exempt.
"""

import base64
import json
import os
import time


def _get_client_ip(handler):
    """Extract the client IP from the request handler."""
    client_address = handler.client_address
    if client_address:
        return client_address[0]
    return ""


def _is_localhost(ip):
    """Check if the IP is a loopback address."""
    return ip in ("127.0.0.1", "::1", "::ffff:127.0.0.1")


def _check_cf_jwt(handler, audience):
    """Validate Cloudflare Access JWT (payload only — signature verified at edge)."""
    token = handler.headers.get("Cf-Access-Jwt-Assertion", "")
    if not token:
        return False, "missing Cf-Access-Jwt-Assertion header"

    try:
        # JWT is header.payload.signature — we only need the payload
        parts = token.split(".")
        if len(parts) != 3:
            return False, "malformed JWT"

        # Base64url decode the payload (add padding as needed)
        payload_b64 = parts[1]
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))

        # Check expiration
        exp = payload.get("exp")
        if exp is not None and time.time() > exp:
            return False, "token expired"

        # Check audience
        token_aud = payload.get("aud", [])
        if isinstance(token_aud, str):
            token_aud = [token_aud]
        if audience not in token_aud:
            return False, "audience mismatch"

        identity = payload.get("email", payload.get("sub", "cf-user"))
        return True, identity
    except (ValueError, KeyError, json.JSONDecodeError) as e:
        return False, f"JWT decode error: {e}"


def _check_bearer_token(handler, expected_token):
    """Check Authorization: Bearer <token> header."""
    auth_header = handler.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return False, "missing or invalid Authorization header"

    token = auth_header[7:]
    if token == expected_token:
        return True, "bearer-token"
    return False, "invalid token"


def check_auth(handler):
    """
    Check if the request is authorized.

    Returns (True, identity_string) or (False, reason_string).
    """
    # /health is always exempt
    path = handler.path.split("?")[0]
    if path == "/health":
        return True, "health-exempt"

    # Localhost bypass
    client_ip = _get_client_ip(handler)
    if _is_localhost(client_ip):
        return True, "localhost"

    cf_aud = os.environ.get("CF_POLICY_AUD", "")
    dashboard_token = os.environ.get("DASHBOARD_TOKEN", "")

    # If neither auth method is configured, allow all (backward compat)
    if not cf_aud and not dashboard_token:
        return True, "no-auth-configured"

    # Try Cloudflare Access JWT first
    if cf_aud:
        ok, info = _check_cf_jwt(handler, cf_aud)
        if ok:
            return True, info

    # Try bearer token fallback
    if dashboard_token:
        ok, info = _check_bearer_token(handler, dashboard_token)
        if ok:
            return True, info

    # All configured methods failed
    return False, "unauthorized"
