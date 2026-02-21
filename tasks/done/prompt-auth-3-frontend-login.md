# Prompt: Frontend Login Screen + Auth Rewrite

## Prerequisites
**Run prompt-auth-1-backend.md first.** The backend must have the Google OAuth endpoints (`POST /api/v1/auth/google`, `POST /api/v1/auth/redeem-invite`) and the updated schemas before the frontend can call them. The admin panel (prompt 2) is NOT required — it's independent.

## Context
DeckForge's Tauri 2 frontend currently auto-registers with the backend using anonymous IDs. There's no login screen — the app just opens and works. We need to:

1. Add a login gate — the app shows a login screen before anything else loads
2. Use Google Sign-In (Google Identity Services library) for authentication
3. Support invite code entry for new users
4. Rewrite `auth.ts` to replace anonymous registration with Google OAuth
5. Update the `AuthToken` type and app initialization flow

**Resolution**: 1280x800 fixed (Steam Deck). No scroll. The login screen must fit.

---

## Section 1: Google Identity Services Setup

### 1.1 Add GIS Script to `index.html`

Add the Google Identity Services script tag to the `<head>`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

This loads Google's authentication library into the Tauri webview. It provides `window.google.accounts.id` for rendering the sign-in button and handling the OAuth callback.

### 1.2 Add TypeScript Declaration

Create `src/lib/types/google.d.ts` (or add to an existing `.d.ts` file):

```typescript
interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
        }) => void;
        renderButton: (
          element: HTMLElement,
          options: {
            theme?: string;
            size?: string;
            text?: string;
            shape?: string;
            width?: number;
          },
        ) => void;
        prompt: () => void;
      };
    };
  };
}
```

### 1.3 Environment Variable

Add `VITE_GOOGLE_CLIENT_ID` to the `.env` (or `.env.local`) file used by Vite:

```
VITE_GOOGLE_CLIENT_ID=<your-google-client-id>
```

**Note for Mathew**: You'll need to create a Google Cloud project and OAuth 2.0 credentials first:
1. Go to https://console.cloud.google.com
2. Create or select a project
3. Go to APIs & Services → Credentials
4. Create OAuth 2.0 Client ID → "Web application"
5. Add authorized JavaScript origins: `tauri://localhost` and `http://localhost:1420`
6. Copy the Client ID
7. Set it as `VITE_GOOGLE_CLIENT_ID` locally and `GOOGLE_CLIENT_ID` on Railway

---

## Section 2: Update Auth Types

### 2.1 Extend `AuthToken` in `src/lib/types/data.ts`

Add new fields to the existing `AuthToken` interface:

```typescript
export interface AuthToken {
  schema_version: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  backend_url: string;
  // NEW — Google identity
  email: string;
  display_name: string;
  avatar_url?: string;
  is_admin: boolean;
}
```

---

## Section 3: Rewrite `src/lib/auth/auth.ts`

Replace the anonymous registration flow with Google OAuth support. The module's responsibilities change:

### What to REMOVE
- The `initAuth(config: GlobalConfig)` function that auto-registers with `anonymized_user_id`
- Any reference to `config.telemetry.anonymized_user_id` for registration

### What to KEEP (unchanged)
- `getAccessToken()` — returns current access token string
- `getBackendUrl()` — returns backend URL
- `refreshAuth()` — refreshes JWT tokens (endpoint unchanged)
- `scheduleRefresh()` — schedules auto-refresh
- `isExpired()` — checks token expiry
- `loadTokenFromDisk()` — loads from `~/.config/deckforge/auth.json`
- `saveTokenToDisk()` — saves to disk
- `isTauri()` — Tauri detection

### What to ADD

```typescript
/**
 * Try to restore a session from disk.
 * Returns the token if valid (or refreshable), null if user needs to log in.
 * This replaces the old initAuth() — it does NOT auto-register.
 */
export async function tryRestoreSession(): Promise<AuthToken | null> {
  const saved = await loadTokenFromDisk();
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
```

### What to MODIFY

Update `refreshAuth()` to preserve the new fields when refreshing:

```typescript
// When building the refreshed AuthToken, carry over identity fields:
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
```

---

## Section 4: Update `src/lib/stores/configStores.ts`

### 4.1 Change `initApp()`

The current `initApp()` calls `initAuth(config)` which auto-registers. Replace with `tryRestoreSession()`:

```typescript
import { tryRestoreSession } from '../auth/auth';

export async function initApp(): Promise<{ config: GlobalConfig; authenticated: boolean }> {
  devLog('lifecycle', 'initApp: loading global config');
  const config = await initGlobalConfig();
  devLog('lifecycle', 'initApp: global config loaded');

  // Try restoring existing session (does NOT auto-register)
  let authenticated = false;
  try {
    const token = await tryRestoreSession();
    if (token) {
      authToken.set(token);
      authenticated = true;
      devLog('lifecycle', 'initApp: session restored');
    } else {
      devLog('lifecycle', 'initApp: no valid session, login required');
    }
  } catch (e) {
    devError('error', 'Session restore failed', e);
  }

  return { config, authenticated };
}
```

**Important**: The return type changes from `Promise<GlobalConfig>` to `Promise<{ config: GlobalConfig; authenticated: boolean }>`. Update any callers of `initApp()` accordingly (check `App.svelte` and any other entry points).

---

## Section 5: Create `src/lib/screens/LoginScreen.svelte`

This is a new screen that gates the entire app. It sits ABOVE the L1/L2/L3 navigation system — it's not a "screen" in that hierarchy, it's a pre-auth gate.

### States

The component has three states:

1. **`sign_in`** — Show the Google Sign-In button
2. **`invite_code`** — Show invite code entry (after Google auth returns `needs_invite: true`)
3. **`loading`** — Show spinner during API calls

### Layout (1280x800, no scroll)

**Sign-In State**:
- Full screen, centered vertically and horizontally
- Card: `#161b22` background, `#30363d` border, minimal radius
- DeckForge wordmark or title at top: "DECKFORGE" in Space Grotesk, white
- Subtle tagline below: "Gamepad-first AI coding" in `#8b949e`
- Google Sign-In button rendered by GIS (`renderButton()` with `theme: 'filled_black'`)
- Below button: version number in muted text

**Invite Code State**:
- Same centered card
- User's Google name displayed: "Welcome, {name}"
- If avatar URL exists, show small circular avatar
- Instruction text: "Enter your invite code to continue"
- Text input:
  - Large, monospace font (`JetBrains Mono`)
  - Centered text, uppercase
  - Max length 8 characters
  - Auto-uppercase via `on:input` handler
  - `#161b22` background, `#30363d` border, `#0df2f2` focus border
- "Activate" button below input
  - `#0df2f2` background, `#0d1117` text (dark on cyan, matching DeckForge style)
  - Disabled while loading
- Error message area (red text, hidden when no error)

**Loading State**:
- Same card, content replaced with a loading spinner or pulsing text
- "Signing in..." or "Activating..."

### Implementation

```svelte
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { saveGoogleAuth } from '../auth/auth';
  import { authToken } from '../stores/configStores';

  const dispatch = createEventDispatcher<{ authenticated: void }>();

  let state: 'sign_in' | 'invite_code' | 'loading' = $state('sign_in');
  let googleIdToken = $state('');
  let userName = $state('');
  let userAvatar = $state('');
  let inviteCode = $state('');
  let error = $state('');

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://deckforge-api-production.up.railway.app';
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  onMount(() => {
    // Wait for GIS to load (it's async defer)
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        initializeGoogle();
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(interval), 10000);
  });

  function initializeGoogle() {
    window.google!.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
    });

    const buttonDiv = document.getElementById('google-signin-btn');
    if (buttonDiv) {
      window.google!.accounts.id.renderButton(buttonDiv, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 280,
      });
    }
  }

  async function handleGoogleResponse(response: { credential: string }) {
    state = 'loading';
    error = '';
    googleIdToken = response.credential;

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: googleIdToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.detail || 'Authentication failed';
        state = 'sign_in';
        return;
      }

      if (data.needs_invite) {
        userName = data.display_name;
        userAvatar = data.avatar_url || '';
        state = 'invite_code';
        // Focus the input after state change
        setTimeout(() => {
          document.getElementById('invite-input')?.focus();
        }, 100);
        return;
      }

      // Existing user — save tokens and proceed
      const token = await saveGoogleAuth(data);
      authToken.set(token);
      dispatch('authenticated');
    } catch (e) {
      error = 'Could not reach server. Check your connection.';
      state = 'sign_in';
    }
  }

  async function submitInviteCode() {
    const code = inviteCode.trim();
    if (code.length < 4) {
      error = 'Code is too short';
      return;
    }

    state = 'loading';
    error = '';

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/redeem-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: googleIdToken,
          invite_code: code,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        error = data.detail || 'Invalid invite code';
        state = 'invite_code';
        return;
      }

      const token = await saveGoogleAuth({
        ...data,
        is_admin: false, // New users aren't admin (backend decides, but not returned from redeem)
      });
      authToken.set(token);
      dispatch('authenticated');
    } catch (e) {
      error = 'Could not reach server.';
      state = 'invite_code';
    }
  }

  function handleInviteInput(e: Event) {
    const input = e.target as HTMLInputElement;
    inviteCode = input.value.toUpperCase().slice(0, 8);
    input.value = inviteCode;
  }

  function handleInviteKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      submitInviteCode();
    }
  }
</script>
```

### Gamepad Support

The login screen needs minimal gamepad support:
- **Invite code input**: The Steam Deck's on-screen keyboard auto-appears when a text input is focused. So just auto-focus the input.
- **A button**: Map to submit/activate (use the existing gamepad input system if the screen is registered, or add a keyboard listener for Enter)
- **Google Sign-In button**: This is rendered by Google's library as an iframe — gamepad can't directly interact with it. The user will need to tap it on the touchscreen. This is fine since it's a one-time action.

---

## Section 6: App Entry Point Gating

### 6.1 Modify `App.svelte` (or Root Component)

The app initialization flow changes. Find where `initApp()` is called and modify the logic:

```
BEFORE:
1. App loads → initApp() → always proceed to L1

AFTER:
1. App loads → initApp() returns { config, authenticated }
2. If authenticated → proceed to L1 (normal flow)
3. If NOT authenticated → show LoginScreen
4. LoginScreen dispatches 'authenticated' event → proceed to L1
```

The LoginScreen is shown in place of the entire app content. It's not within the L1/L2/L3 navigation — it wraps around it:

```svelte
{#if !authenticated}
  <LoginScreen on:authenticated={() => authenticated = true} />
{:else}
  <!-- existing app content (L1/L2/L3, terminal panel, etc.) -->
{/if}
```

### 6.2 Handle Logout

Add a logout mechanism somewhere accessible (Settings screen, or a gamepad shortcut). When triggered:

```typescript
import { logout } from '../auth/auth';
import { authToken } from '../stores/configStores';

async function handleLogout() {
  await logout();
  authToken.set(null);
  // Set authenticated = false to show LoginScreen again
}
```

---

## Section 7: Backward Compatibility

### 7.1 Existing `auth.json` Files

Users who already have `~/.config/deckforge/auth.json` from the anonymous flow will have tokens that don't include the new fields (`email`, `display_name`, etc.). Handle this gracefully:

In `tryRestoreSession()`, if the loaded token doesn't have `email`, treat it as invalid and return null (forcing re-login via Google). This is a one-time migration — old anonymous tokens get discarded:

```typescript
if (saved && !saved.email) {
  // Old anonymous token — needs Google re-auth
  return null;
}
```

### 7.2 `GlobalConfig.telemetry.anonymized_user_id`

This field still exists and is still used by the config system. Don't remove it — the backend still uses `anonymized_id` on the `User` model. The change is just that we no longer use it for registration — Google sub takes over as the identity.

---

## Section 8: Verification Checklist

After completion, verify:

1. App starts and shows LoginScreen (no valid token on disk)
2. Google Sign-In button renders and is clickable
3. Clicking Sign-In opens Google auth popup in webview
4. New user (no existing account) → redirected to invite code screen
5. Entering a valid invite code → creates account, saves token, shows L1
6. Existing user → skips invite code, goes straight to L1
7. Token persists to disk (`~/.config/deckforge/auth.json`) with new fields
8. App restart → auto-restores session, skips login screen
9. Expired token → refresh happens automatically
10. Failed refresh → shows login screen again
11. Old anonymous `auth.json` → treated as invalid, shows login screen
12. Invite code input auto-uppercases
13. Error messages display correctly for invalid codes, network errors
14. No TypeScript errors (`npm run check`)
15. Existing navigation (L1/L2/L3) works normally after authentication

---

## File Change Summary

### New Files
```
src/lib/screens/LoginScreen.svelte
src/lib/types/google.d.ts        (or added to existing .d.ts)
```

### Modified Files
```
index.html                         — Add GIS script tag
src/lib/types/data.ts              — Extend AuthToken interface
src/lib/auth/auth.ts               — Replace initAuth with tryRestoreSession, add saveGoogleAuth, logout
src/lib/stores/configStores.ts     — Update initApp() return type and logic
src/App.svelte                     — Add login gate (show LoginScreen if not authenticated)
.env                               — Add VITE_GOOGLE_CLIENT_ID
```
