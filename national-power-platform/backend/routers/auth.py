"""Authentication and operator access-request endpoints."""

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status

from config import settings
from models.schemas import AccessRequestPayload, UserLoginRequest


def get_auth_router() -> APIRouter:
    """
    Builds the authentication and access-request router.

    Access requests are mirrored in memory as a fallback when Supabase is not
    configured. An optional environment-configured admin (`ADMIN_EMAIL` and
    `ADMIN_PASSWORD`) is seeded automatically when provided.
    """
    router = APIRouter(tags=["Authentication"])

    # In-memory store keyed by lowercase email
    access_requests: Dict[str, Dict[str, Any]] = {}

    if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
        access_requests[settings.ADMIN_EMAIL] = {
            "id": "env-admin",
            "full_name": settings.ADMIN_EMAIL.split("@")[0],
            "email": settings.ADMIN_EMAIL,
            "institution": "FUT Minna (ML4PS)",
            "reason": "Platform Administrator",
            "password": settings.ADMIN_PASSWORD,
            "role": "admin",
            "status": "approved",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    @router.post("/api/auth/request-access")
    def upsert_access_request(req: AccessRequestPayload):
        """Creates or updates an operator access request."""
        clean_email = req.email.strip().lower()
        existing = access_requests.get(clean_email)
        record = {
            "id": req.id or (existing["id"] if existing else f"req-{int(datetime.now(timezone.utc).timestamp() * 1000)}"),
            "full_name": req.full_name.strip(),
            "email": clean_email,
            "institution": req.institution.strip() or "Independent",
            "reason": req.reason.strip() or "Power System Simulation",
            "password": req.password if req.password is not None else (existing.get("password") if existing else ""),
            "role": req.role,
            "status": req.status,
            "created_at": req.created_at or (existing["created_at"] if existing else datetime.now(timezone.utc).isoformat()),
        }
        access_requests[clean_email] = record
        return {"status": "ok", "record": {k: v for k, v in record.items() if k != "password"}}

    @router.get("/api/admin/requests")
    def list_access_requests():
        """Returns all operator access requests for administrator review."""
        return list(access_requests.values())

    @router.post("/api/auth/login")
    def login(req: UserLoginRequest):
        """Authenticates an approved operator against the backend store."""
        clean_email = req.email.strip().lower()
        record = access_requests.get(clean_email)

        if not record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account not found. Submit an access request first.",
            )

        if record["status"] == "pending":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account request is pending administrator approval.",
            )

        if record["status"] != "approved":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account request was declined by an administrator.",
            )

        if record.get("password") and record["password"] != req.password.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password.",
            )

        return {
            "status": "success",
            "user": {
                "id": record["id"],
                "name": record["full_name"],
                "email": record["email"],
                "institution": record["institution"],
                "role": record["role"],
            },
        }

    return router
