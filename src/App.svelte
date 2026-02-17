<script lang="ts">
  import { onMount } from 'svelte';
  import StatusBar from './lib/components/StatusBar.svelte';
  import ScreenRouter from './lib/components/ScreenRouter.svelte';
  import FlashOverlay from './lib/components/FlashOverlay.svelte';
  import StartMenu from './lib/components/StartMenu.svelte';
  import { projectName, connected, navigate, splitRatio } from './lib/stores/app';
  import type { Screen } from './lib/stores/app';
  import { startGamepadPolling, stopGamepadPolling } from './lib/input/gamepad';
  import { handleInput } from './lib/input/inputRouter';
  import { scrollTerminal } from './lib/stores/terminalScroll';
  import { initApp as initAppConfig } from './lib/stores/configStores';
  import { startSystemStatsPolling, stopSystemStatsPolling } from './lib/stores/systemStats';

  // Initialize app state (will be overridden by config load)
  projectName.set('');
  connected.set(false);

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
    r: 'R4',
  };

  let shiftHeld = false;
  let shiftComboFired = false;

  // Load global config + auth asynchronously on startup
  async function initApp() {
    try {
      const config = await initAppConfig();

      // Apply display settings from config
      splitRatio.set(config.display.default_split_ratio);
      connected.set(true);

      // Determine start screen based on config state
      if (!config.user.onboarding_completed && !(config.recent_projects?.length > 0)) {
        navigate('empty_state');
      } else {
        navigate('project_select');
      }
    } catch (error) {
      console.error('Failed to initialize app config:', error);
      navigate('empty_state');
      connected.set(true);
    }
  }

  onMount(() => {
    // Kick off async config load
    initApp();

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
