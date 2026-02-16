from __future__ import annotations

from pydantic import BaseModel


class RegisterRequest(BaseModel):
    anonymized_id: str
    app_version: str | None = None


class RegisterResponse(BaseModel):
    user_id: str
    access_token: str
    refresh_token: str
    expires_at: str


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_at: str
