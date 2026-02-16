// ─── JWT Auth Module ─────────────────────────────────────────────────────────
// Handles registration, token storage, and auto-refresh against the FastAPI backend.
// Falls back gracefully when backend is unreachable (mock mode continues working).

import type { GlobalConfig, AuthToken } from '../types/data';

// ─── State ───────────────────────────────────────────────────────────────────

let currentToken: AuthToken | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_BACKEND_URL = 'http://localhost:8000';
const AUTH_FILE = 'auth.json';

// ─── Tauri detection (mirrors data/config.ts) ────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Disk I/O (Tauri only) ───────────────────────────────────────────────────

async function getAuthPath(): Promise<string> {
  const { homeDir } = await import('@tauri-apps/api/path');
  const home = (await homeDir()).replace(/\/+$/, '');
  return `${home}/.config/deckforge/${AUTH_FILE}`;
}

async function loadTokenFromDisk(): Promise<AuthToken | null> {
  if (!isTauri()) return null;
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
    const path = await getAuthPath();
    if (!(await exists(path))) return null;
    const content = await readTextFile(path);
    return JSON.parse(content) as AuthToken;
  } catch {
    return null;
  }
}

async function saveTokenToDisk(token: AuthToken): Promise<void> {
  if (!isTauri()) return;
  try {
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
    const { homeDir } = await import('@tauri-apps/api/path');
    const home = (await homeDir()).replace(/\/+$/, '');
    const dir = `${home}/.config/deckforge`;
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
    await writeTextFile(`${dir}/${AUTH_FILE}`, JSON.stringify(token, null, 2));
  } catch (e) {
    console.warn('Failed to save auth token:', e);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize auth: load token from disk, or register with backend.
 * Returns the token on success, null on failure (mock mode will be used).
 */
export async function initAuth(config: GlobalConfig): Promise<AuthToken | null> {
  // Try loading from disk first
  const saved = await loadTokenFromDisk();
  if (saved && !isExpired(saved)) {
    currentToken = saved;
    scheduleRefresh(saved);
    console.log('Loaded auth token from disk');
    return saved;
  }

  // If we have a saved token that's expired, try refreshing it
  if (saved) {
    const refreshed = await refreshAuth(saved);
    if (refreshed) return refreshed;
  }

  // Register new
  const backendUrl = DEFAULT_BACKEND_URL;
  try {
    const res = await fetch(`${backendUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anonymized_id: config.telemetry.anonymized_user_id,
        app_version: 'v0.1.0',
      }),
    });

    if (!res.ok) {
      console.warn(`Auth register failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const token: AuthToken = {
      schema_version: 1,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      backend_url: backendUrl,
    };

    currentToken = token;
    await saveTokenToDisk(token);
    scheduleRefresh(token);
    console.log('Registered with backend');
    return token;
  } catch (e) {
    console.warn('Backend unreachable, using mock mode:', e);
    return null;
  }
}

/**
 * Returns the current access token string, or null if not authenticated.
 */
export function getAccessToken(): string | null {
  if (!currentToken) return null;
  if (isExpired(currentToken)) return null;
  return currentToken.access_token;
}

/**
 * Returns the backend URL from the stored token.
 */
export function getBackendUrl(): string {
  return currentToken?.backend_url ?? DEFAULT_BACKEND_URL;
}

/**
 * Refresh the access token using the refresh token.
 */
export async function refreshAuth(token?: AuthToken): Promise<AuthToken | null> {
  const t = token ?? currentToken;
  if (!t) return null;

  const backendUrl = t.backend_url ?? DEFAULT_BACKEND_URL;
  try {
    const res = await fetch(`${backendUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: t.refresh_token }),
    });

    if (!res.ok) {
      console.warn(`Auth refresh failed: ${res.status}`);
      currentToken = null;
      return null;
    }

    const data = await res.json();
    const refreshed: AuthToken = {
      schema_version: 1,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      backend_url: backendUrl,
    };

    currentToken = refreshed;
    await saveTokenToDisk(refreshed);
    scheduleRefresh(refreshed);
    console.log('Auth token refreshed');
    return refreshed;
  } catch (e) {
    console.warn('Auth refresh failed:', e);
    currentToken = null;
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isExpired(token: AuthToken): boolean {
  const expiresAt = new Date(token.expires_at).getTime();
  return Date.now() >= expiresAt;
}

function scheduleRefresh(token: AuthToken): void {
  if (refreshTimer) clearTimeout(refreshTimer);

  const expiresAt = new Date(token.expires_at).getTime();
  // Refresh 5 minutes before expiry
  const refreshIn = expiresAt - Date.now() - 5 * 60 * 1000;

  if (refreshIn <= 0) {
    // Already close to expiry, refresh now
    refreshAuth(token);
    return;
  }

  refreshTimer = setTimeout(() => refreshAuth(token), refreshIn);
}
