<script lang="ts">
  import { onMount } from 'svelte';
  import StatusBar from './lib/components/StatusBar.svelte';
  import ScreenRouter from './lib/components/ScreenRouter.svelte';
  import FlashOverlay from './lib/components/FlashOverlay.svelte';
  import StartMenu from './lib/components/StartMenu.svelte';
  import LoginScreen from './lib/screens/LoginScreen.svelte';
  import { projectName, connected, navigate, splitRatio } from './lib/stores/app';
  import type { Screen } from './lib/stores/app';
  import { startGamepadPolling, stopGamepadPolling } from './lib/input/gamepad';
  import { handleInput } from './lib/input/inputRouter';
  import { inputMode } from './lib/input/inputMode.svelte';
  import { scrollTerminal } from './lib/stores/terminalScroll';
  import { initApp as initAppConfig } from './lib/stores/configStores';
  import { startSystemStatsPolling, stopSystemStatsPolling } from './lib/stores/systemStats';
  import { discoverClaude } from './lib/system/claudeResolver';
  import { checkForUpdate } from './lib/system/updateChecker';

  // Initialize app state (will be overridden by config load)
  projectName.set('');
  connected.set(false);

  let authenticated = $state(false);
  let appReady = $state(false);

  // Debug keyboard shortcuts: number keys to switch screens
  const screenMap: Record<string, Screen> = {
    '1': 'level1',
    '2': 'level2',
    '3': 'level3',
    '4': 'project_select',
    '5': 'empty_state',
    '6': 'ai_working',
    '7': 'qa_mode',
    '8': 'deploy_mode',
    '9': 'history',
    '0': 'exploration',
    '-': 'voice_pitch',
    '=': 'error',
    'p': 'screenshot_feedback',
    's': 'settings',
  };

  // Keyboard → gamepad button mapping (fallback for development)
  // Back grips (L4/R4/L5/R5) use F1-F4 — map these in Steam Input on the Deck.
  const keyToButton: Record<string, string> = {
    ArrowUp: 'DPAD_UP',
    ArrowDown: 'DPAD_DOWN',
    ArrowLeft: 'DPAD_LEFT',
    ArrowRight: 'DPAD_RIGHT',
    Enter: 'A',
    Escape: 'B',
    q: 'X',
    e: 'Y',
    Tab: 'RB',
    m: 'START',
    v: 'SELECT',
    r: 'R4',       // dev keyboard shortcut
    F1: 'L4',      // Steam Input: map L4 grip → F1
    F2: 'R4',      // Steam Input: map R4 grip → F2
    F3: 'L5',      // Steam Input: map L5 grip → F3
    F4: 'R5',      // Steam Input: map R5 grip → F4
  };

  let shiftHeld = false;
  let shiftComboFired = false;

  // Load global config + auth asynchronously on startup
  async function initApp() {
    // Non-blocking: discover claude CLI + check for updates in parallel with config load
    discoverClaude();
    if ('__TAURI_INTERNALS__' in window) {
      checkForUpdate();
    }

    try {
      const { config, authenticated: isAuthed } = await initAppConfig();
      authenticated = isAuthed;
      appReady = true;

      if (isAuthed) {
        startAuthenticatedApp(config);
      }
    } catch (error) {
      console.error('Failed to initialize app config:', error);
      appReady = true;
      navigate('empty_state');
      connected.set(true);
    }
  }

  function startAuthenticatedApp(config: import('./lib/types/data').GlobalConfig) {
    // Apply display settings from config
    splitRatio.set(config.display.default_split_ratio);
    connected.set(true);

    // Determine start screen based on config state
    if (!config.user.onboarding_completed && !(config.recent_projects?.length > 0)) {
      navigate('empty_state');
    } else {
      navigate('project_select');
    }
  }

  function handleAuthenticated() {
    authenticated = true;
    // Re-initialize with the now-authenticated state
    initAppConfig().then(({ config }) => {
      startAuthenticatedApp(config);
    });
  }

  onMount(() => {
    // Kick off async config load
    initApp();

    // Detect initial input mode from connected gamepads
    const gamepads = navigator.getGamepads();
    const hasGamepad = gamepads && Array.from(gamepads).some(gp => gp !== null);
    inputMode.set(hasGamepad ? 'gamepad' : 'keyboard');

    // Start gamepad polling with analog handler for R-stick terminal scroll
    startGamepadPolling(handleInput, (axis, value) => {
      if (axis === 'R_STICK_Y') {
        scrollTerminal(value * 8);
      }
    });
    startSystemStatsPolling(2000);

    function handleKeydown(e: KeyboardEvent) {
      // Debug screen shortcuts (number keys)
      const screen = screenMap[e.key];
      if (screen) {
        navigate(screen);
        return;
      }

      // Shift acts as LB modifier
      if (e.key === 'Shift') {
        shiftHeld = true;
        shiftComboFired = false;
        return;
      }

      // Map keyboard to gamepad button
      const button = keyToButton[e.key];
      if (button) {
        e.preventDefault();
        inputMode.set('keyboard');
        if (shiftHeld) {
          handleInput(`LB_${button}`);
          shiftComboFired = true;
        } else {
          handleInput(button);
        }
      }
    }

    function handleKeyup(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        if (!shiftComboFired) {
          inputMode.set('keyboard');
          handleInput('LB');
        }
        shiftHeld = false;
        shiftComboFired = false;
      }
    }

    function handleBlur() {
      shiftHeld = false;
      shiftComboFired = false;
    }

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
    window.addEventListener('blur', handleBlur);

    return () => {
      stopGamepadPolling();
      stopSystemStatsPolling();
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
      window.removeEventListener('blur', handleBlur);
    };
  });
</script>

{#if !appReady}
  <!-- Blank screen while loading config -->
  <div class="h-screen w-screen bg-[#0d1117]"></div>
{:else if !authenticated}
  <LoginScreen on:authenticated={handleAuthenticated} />
{:else}
  <div class="h-screen w-screen flex flex-col overflow-hidden">
    <FlashOverlay />
    <StartMenu />

    <!-- Status Bar -->
    <StatusBar projectName={$projectName} connected={$connected} version="v0.1.0" />

    <!-- Main Workspace -->
    <main class="flex-1 flex overflow-hidden relative">
      <ScreenRouter />
    </main>
  </div>
{/if}
