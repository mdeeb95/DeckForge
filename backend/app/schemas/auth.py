"""Auth request/response schemas."""
from __future__ import annotations
from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    id_token: str | None = None      # Google ID token from GIS (browser flow)
    auth_code: str | None = None     # Authorization code (Tauri desktop flow)
    redirect_uri: str | None = None  # Required when using auth_code
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
    id_token: str | None = None      # Google ID token (browser flow)
    auth_code: str | None = None     # Authorization code (Tauri desktop flow)
    redirect_uri: str | None = None  # Required when using auth_code
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
