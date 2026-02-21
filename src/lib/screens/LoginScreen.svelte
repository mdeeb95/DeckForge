<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { saveGoogleAuth, startDesktopOAuthFlow } from '../auth/auth';
  import { authToken } from '../stores/configStores';

  const dispatch = createEventDispatcher<{ authenticated: void }>();

  let loginState: 'sign_in' | 'invite_code' | 'loading' = $state('sign_in');
  let googleIdToken = $state('');
  let authCode = $state('');
  let authRedirectUri = $state('');
  let userName = $state('');
  let userAvatar = $state('');
  let inviteCode = $state('');
  let error = $state('');
  let isTauriEnv = $state(false);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://deckforge-api-production.up.railway.app';
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  onMount(() => {
    isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    if (!isTauriEnv) {
      // Browser mode: use GIS popup flow
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initializeGoogle();
        }
      }, 100);

      const timeout = setTimeout(() => clearInterval(interval), 10000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
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

  async function handleTauriSignIn() {
    loginState = 'loading';
    error = '';

    try {
      const { code, redirectUri } = await startDesktopOAuthFlow(GOOGLE_CLIENT_ID);
      authCode = code;
      authRedirectUri = redirectUri;

      const res = await fetch(`${BACKEND_URL}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_code: authCode, redirect_uri: authRedirectUri }),
      });

      const data = await res.json();

      if (!res.ok) {
        error = parseError(data.detail);
        loginState = 'sign_in';
        return;
      }

      if (data.needs_invite) {
        userName = data.display_name;
        userAvatar = data.avatar_url || '';
        loginState = 'invite_code';
        setTimeout(() => {
          document.getElementById('invite-input')?.focus();
        }, 100);
        return;
      }

      const token = await saveGoogleAuth(data);
      authToken.set(token);
      dispatch('authenticated');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sign-in failed';
      loginState = 'sign_in';
    }
  }

  async function handleGoogleResponse(response: { credential: string }) {
    loginState = 'loading';
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
        loginState = 'sign_in';
        return;
      }

      if (data.needs_invite) {
        userName = data.display_name;
        userAvatar = data.avatar_url || '';
        loginState = 'invite_code';
        setTimeout(() => {
          document.getElementById('invite-input')?.focus();
        }, 100);
        return;
      }

      const token = await saveGoogleAuth(data);
      authToken.set(token);
      dispatch('authenticated');
    } catch {
      error = 'Could not reach server. Check your connection.';
      loginState = 'sign_in';
    }
  }

  async function submitInviteCode() {
    const code = inviteCode.trim();
    if (code.length < 4) {
      error = 'Code is too short';
      return;
    }

    loginState = 'loading';
    error = '';

    try {
      // For Tauri desktop flow, we need a new auth code since the original was already exchanged.
      // The user will need to sign in again with the invite code on the backend side.
      // However, the backend redeem-invite still needs an id_token — so for Tauri we
      // re-authenticate by starting a new OAuth flow, but this time we already know the user.
      // For simplicity, we pass the same id_token (browser) or do a fresh flow (Tauri).
      let redeemBody: Record<string, string>;
      if (isTauriEnv && authCode) {
        // For Tauri, start a fresh OAuth to get a new auth code for the redeem endpoint
        // Actually, we need to modify the redeem endpoint too — but for now, let's use the
        // id_token if we have one. If using Tauri, we need to re-auth.
        try {
          const { code: newCode, redirectUri } = await startDesktopOAuthFlow(GOOGLE_CLIENT_ID);
          redeemBody = { auth_code: newCode, redirect_uri: redirectUri, invite_code: code };
        } catch {
          error = 'Failed to re-authenticate for invite code. Try again.';
          loginState = 'invite_code';
          return;
        }
      } else {
        redeemBody = { id_token: googleIdToken, invite_code: code };
      }
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/redeem-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(redeemBody),
      });

      const data = await res.json();

      if (!res.ok) {
        error = parseError(data.detail) || 'Invalid invite code';
        loginState = 'invite_code';
        return;
      }

      const token = await saveGoogleAuth({
        ...data,
        is_admin: false,
      });
      authToken.set(token);
      dispatch('authenticated');
    } catch {
      error = 'Could not reach server.';
      loginState = 'invite_code';
    }
  }

  function parseError(detail: unknown): string {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      return detail[0]?.msg || 'Validation error';
    }
    return 'Authentication failed';
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

<div class="h-screen w-screen flex items-center justify-center bg-[#0d1117]">
  <div class="w-[400px] border border-[#30363d] bg-[#161b22] rounded-sm p-8 flex flex-col items-center gap-6">

    {#if loginState === 'sign_in'}
      <!-- Title -->
      <div class="text-center">
        <h1 class="text-2xl font-bold text-white font-display tracking-wider">DECKFORGE</h1>
        <p class="text-sm text-[#8b949e] mt-1">Gamepad-first AI coding</p>
      </div>

      <!-- Google Sign-In Button -->
      {#if isTauriEnv}
        <button
          onclick={handleTauriSignIn}
          class="flex items-center gap-3 px-6 py-3 bg-white text-gray-800 rounded-sm font-medium text-sm
                 hover:bg-gray-100 transition-colors w-[280px] justify-center"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
      {:else}
        <div id="google-signin-btn" class="min-h-[44px]"></div>
      {/if}

      <!-- Error -->
      {#if error}
        <p class="text-red-400 text-sm text-center">{error}</p>
      {/if}

      <!-- Version -->
      <p class="text-xs text-[#484f58]">v0.1.0</p>

    {:else if loginState === 'invite_code'}
      <!-- Welcome with avatar -->
      <div class="text-center flex flex-col items-center gap-3">
        {#if userAvatar}
          <img src={userAvatar} alt="" class="w-12 h-12 rounded-full" referrerpolicy="no-referrer" />
        {/if}
        <h2 class="text-lg font-medium text-white">Welcome, {userName}</h2>
        <p class="text-sm text-[#8b949e]">Enter your invite code to continue</p>
      </div>

      <!-- Invite code input -->
      <input
        id="invite-input"
        type="text"
        maxlength="8"
        value={inviteCode}
        oninput={handleInviteInput}
        onkeydown={handleInviteKeydown}
        placeholder="ABCD1234"
        class="w-full px-4 py-3 bg-[#161b22] border border-[#30363d] rounded-sm text-center text-xl
               font-mono text-white uppercase tracking-widest
               focus:border-[#0df2f2] focus:outline-none focus:ring-1 focus:ring-[#0df2f2]/30
               placeholder:text-[#30363d]"
      />

      <!-- Activate button -->
      <button
        onclick={submitInviteCode}
        disabled={inviteCode.trim().length < 4}
        class="w-full py-3 rounded-sm font-medium text-sm transition-colors
               bg-[#0df2f2] text-[#0d1117] hover:bg-[#0df2f2]/90
               disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Activate
      </button>

      <!-- Error -->
      {#if error}
        <p class="text-red-400 text-sm text-center">{error}</p>
      {/if}

      <!-- Back link -->
      <button
        onclick={() => { loginState = 'sign_in'; error = ''; }}
        class="text-xs text-[#8b949e] hover:text-white transition-colors"
      >
        Use a different account
      </button>

    {:else}
      <!-- Loading state -->
      <div class="flex flex-col items-center gap-4 py-8">
        <div class="w-6 h-6 border-2 border-[#0df2f2]/30 border-t-[#0df2f2] rounded-full animate-spin"></div>
        <p class="text-sm text-[#8b949e]">
          {loginState === 'loading' && inviteCode ? 'Activating...' : 'Signing in...'}
        </p>
      </div>
    {/if}

  </div>
</div>
