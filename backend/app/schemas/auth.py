"""Auth request/response schemas."""
from __future__ import annotations
from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    id_token: str                    # Google ID token from GIS
    app_version: str | None = None


class GoogleAuthResponse(BaseModel):
    needs_invite: bool               # True if user needs to enter an invite code
    email: str = ""
    display_name: str = ""
    avatar_url: str | None = None
    user_id: str | None = None       # Only set if needs_invite=False
    access_token: str | None = None
    refresh_token: str | None = None
    expires_at: str | None = None
    is_admin: bool = False


class RedeemInviteRequest(BaseModel):
    id_token: str                    # Google ID token (verified again)
    invite_code: str                 # The invite code to redeem
    app_version: str | None = None


class RedeemInviteResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    access_token: str
    refresh_token: str
    expires_at: str


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: str
