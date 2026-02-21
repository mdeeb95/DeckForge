// ─── JWT Auth Module ─────────────────────────────────────────────────────────
// Handles Google OAuth token storage, auto-refresh, and session management.
// Falls back gracefully when backend is unreachable.

import type { AuthToken } from '../types/data';

// ─── State ───────────────────────────────────────────────────────────────────

let currentToken: AuthToken | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://deckforge-api-production.up.railway.app';
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
 * Try to restore a session from disk.
 * Returns the token if valid (or refreshable), null if user needs to log in.
 * This replaces the old initAuth() — it does NOT auto-register.
 */
export async function tryRestoreSession(): Promise<AuthToken | null> {
  const saved = await loadTokenFromDisk();

  // Old anonymous tokens (pre-Google auth) don't have email — force re-login
  if (saved && !saved.email) {
    return null;
  }

  if (saved && !isExpired(saved)) {
    currentToken = saved;
    scheduleRefresh(saved);
    return saved;
  }

  if (saved) {
    // Token expired, try refreshing
    const refreshed = await refreshAuth(saved);
    if (refreshed) return refreshed;
  }

  // No valid session — caller should show login screen
  return null;
}

/**
 * Save auth data from a successful Google login.
 * Called by LoginScreen after POST /auth/google or POST /auth/redeem-invite.
 */
export async function saveGoogleAuth(data: {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  is_admin: boolean;
}): Promise<AuthToken> {
  const token: AuthToken = {
    schema_version: 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    backend_url: DEFAULT_BACKEND_URL,
    email: data.email,
    display_name: data.display_name,
    avatar_url: data.avatar_url,
    is_admin: data.is_admin,
  };
  currentToken = token;
  await saveTokenToDisk(token);
  scheduleRefresh(token);
  return token;
}

/**
 * Log out: clear token from memory and disk.
 */
export async function logout(): Promise<void> {
  currentToken = null;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (isTauri()) {
    try {
      const { remove, exists } = await import('@tauri-apps/plugin-fs');
      const path = await getAuthPath();
      if (await exists(path)) {
        await remove(path);
      }
    } catch {
      // Best effort
    }
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
 * Preserves identity fields (email, display_name, etc.) from the previous token.
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
      // Preserve identity from previous token
      email: t.email,
      display_name: t.display_name,
      avatar_url: t.avatar_url,
      is_admin: t.is_admin,
    };

    currentToken = refreshed;
    await saveTokenToDisk(refreshed);
    scheduleRefresh(refreshed);
    return refreshed;
  } catch (e) {
    console.warn('Auth refresh failed:', e);
    currentToken = null;
    return null;
  }
}

// ─── Tauri OAuth (system browser flow) ───────────────────────────────────────

const OAUTH_CALLBACK_PORT = 14380;

/**
 * Start the desktop OAuth flow:
 * 1. Open Google OAuth URL in system browser
 * 2. Listen for callback on localhost
 * 3. Return the auth code
 */
export async function startDesktopOAuthFlow(googleClientId: string): Promise<{ code: string; redirectUri: string }> {
  if (!isTauri()) throw new Error('Desktop OAuth only available in Tauri');

  const redirectUri = `http://localhost:${OAUTH_CALLBACK_PORT}/auth/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // Open in system browser
  const { open } = await import('@tauri-apps/plugin-shell');
  await open(authUrl);

  // Start a one-shot HTTP listener to capture the callback
  const code = await listenForOAuthCallback(state);

  return { code, redirectUri };
}

async function listenForOAuthCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('OAuth callback timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    // Use a polling approach: the Rust side will handle the HTTP listener
    // We communicate via Tauri commands
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string>('start_oauth_listener', { port: OAUTH_CALLBACK_PORT, expectedState })
        .then((code) => {
          clearTimeout(timeout);
          resolve(code);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(new Error(`OAuth listener failed: ${err}`));
        });
    });
  });
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
