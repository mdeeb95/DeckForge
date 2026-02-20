import { get } from 'svelte/store';
import { currentScreen, navigate, splitRatio, pendingClaudePrompt, startMenuOpen, previousScreen, keyboardOpen } from '../stores/app';
import type { Screen } from '../stores/app';
import { navigateUp, navigateDown, activateSelected, activateByButton, cycleSelectedIndex } from './navigation';
import { rerollSuggestions } from '../stores/prediction';
import { screenshotFlash, lastScreenshotPath, lastScreenshotMeta } from '../stores/screenshot';
import { devLog, devError } from '../utils/devLog';
import { playBack, playCapture, playToggle, playMenuOpen, playMenuClose, playReroll, playClick, playNav } from '../audio/sfx';

type HandlerMap = Record<string, () => void>;

function getScreenHandlers(screen: Screen): HandlerMap {
  switch (screen) {
    // ── Level 1: Category Select ──────────────────────────────────
    // A = select highlighted card. B = no action (home screen).
    // D-pad navigates. START = QA Mode. SELECT = History.
    case 'level1':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate('project_select'); },
        SELECT: () => {
          // Block navigation during error recovery — user should resolve the error first
          import('../stores/launcher').then(({ appError }) => {
            if (!get(appError)) { playClick(); navigate('qa_mode'); }
          });
        },
      };

    // ── Level 2: Suggestions ──────────────────────────────────────
    // A = select highlighted suggestion → Level 3. B = back to Level 1.
    // X = toggle modifier. Y = reroll suggestions.
    case 'level2':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate('level1'); },
        Y: () => { playReroll(); rerollSuggestions(); },
      };

    // ── Level 3: Plan Confirmation ────────────────────────────────
    // A = select highlighted (Ship It). B = go back card. X = tell me more. Y = ship unhinged.
    case 'level3':
      return {
        A: activateSelected,
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        LB: () => activateByButton('B'),
      };

    // ── AI Working ────────────────────────────────────────────────
    // A = select highlighted card. B = interrupt/back (state-dependent).
    case 'ai_working':
      return {
        A: activateSelected,
        B: () => activateByButton('B'),
      };

    // ── QA Mode ───────────────────────────────────────────────────
    // A = select highlighted card. B = back to Level 1 (safe — no revert).
    // X = run tests. Y = view diff.
    case 'qa_mode':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate('level1'); },
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
      };

    // ── Deploy Mode ───────────────────────────────────────────────
    // A = select highlighted card. B = back to Level 1.
    // RB/LB = secondary actions. START = back to Level 1.
    case 'deploy_mode':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate('level1'); },
        RB: () => activateByButton('RB'),
        LB: () => activateByButton('LB'),
        START: () => { playBack(); navigate('level1'); },
      };

    // ── History ───────────────────────────────────────────────────
    // A = select highlighted card. B = back to Level 1. Y = rollback.
    case 'history':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate('level1'); },
        Y: () => activateByButton('Y'),
      };

    // ── Project Select ────────────────────────────────────────────
    // A = select highlighted project. B = no action (root screen).
    // RB/LB = browse for project.
    case 'project_select':
      return {
        A: activateSelected,
        RB: () => activateByButton('RB'),
        LB: () => activateByButton('LB'),
      };

    // ── Empty State ───────────────────────────────────────────────
    // A = select highlighted card. Y = demo mode shortcut. LB = settings.
    case 'empty_state':
      return {
        A: activateSelected,
        Y: () => activateByButton('Y'),
        LB: () => navigate('settings'),
      };

    // ── Exploration ───────────────────────────────────────────────
    // A = select highlighted card. B = back to project select.
    // D-pad left/right also navigate.
    case 'exploration':
      return {
        DPAD_LEFT: navigateUp,
        DPAD_RIGHT: navigateDown,
        A: activateSelected,
        B: () => { playBack(); navigate('project_select'); },
      };

    // ── Voice Pitch ───────────────────────────────────────────────
    // A = select highlighted card. B = cancel/back (phase-dependent).
    case 'voice_pitch':
      return {
        A: activateSelected,
        B: () => activateByButton('B'),
      };

    // ── Screenshot Feedback ─────────────────────────────────────
    // A = select highlighted card. B = back to Level 1.
    // X = voice annotate. Y = send + new task.
    case 'screenshot_feedback':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate('level1'); },
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
      };

    // ── Error ─────────────────────────────────────────────────────
    // A = select highlighted card. B = clear error + back to Level 1.
    // X = view full error.
    case 'error':
      return {
        A: activateSelected,
        B: () => {
          playBack();
          import('../stores/errorStore').then(({ clearError }) => {
            clearError();
            navigate('level1');
          });
        },
        X: () => activateByButton('X'),
      };

    // ── Session Recap ─────────────────────────────────────────────
    // A = Continue (back to L1). B = New Session (reset + L1). Y = One More Run.
    case 'session_recap':
      return {
        A: activateSelected,
        B: () => activateByButton('B'),
        Y: () => activateByButton('Y'),
      };

    // ── Settings Hub ───────────────────────────────────────────────
    // A = select highlighted sub-screen. B = back to previous screen.
    // START/LB = close settings. X = check for updates.
    case 'settings':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate(get(previousScreen) || 'empty_state'); },
        START: () => { playBack(); navigate(get(previousScreen) || 'empty_state'); },
        LB: () => { playBack(); navigate(get(previousScreen) || 'empty_state'); },
        X: () => activateByButton('X'),
      };

    // ── Settings Sub-Screens ───────────────────────────────────────
    // A = select highlighted card (toggle/adjust). B = back to settings hub.
    // LB = back to hub. START = close settings entirely.
    case 'settings_prediction':
    case 'settings_display':
    case 'settings_telemetry':
    case 'settings_advanced':
      return {
        A: activateSelected,
        B: () => { playBack(); navigate('settings'); },
        LB: () => { playBack(); navigate('settings'); },
        START: () => { playBack(); navigate(get(previousScreen) || 'empty_state'); },
      };

    default:
      return {};
  }
}

// ── Global handlers (active on ALL screens) ─────────────────────────
// LB + D-pad left/right adjusts split ratio (5% increments, min 20%, max 80%).
// RT = switch to app window, LT = switch to DeckForge, R4 = restart app.
// SELECT = toggle terminal tab (Claude Code / App Output).
// RB = screenshot (fallback — only fires if screen doesn't handle RB).
const globalHandlers: HandlerMap = {
  DPAD_UP: navigateUp,
  DPAD_DOWN: navigateDown,
  RB: () => {
    devLog('input', 'Global RB → screenshot capture');
    playCapture();
    screenshotFlash.set(true);
    import('../stores/session').then(({ incrementScreenshots }) => incrementScreenshots());
    import('../system/screenshot').then(m => {
      m.captureScreenshot('.', 1).then(result => {
        lastScreenshotPath.set(result.path);
        lastScreenshotMeta.set(result.meta);
        navigate('screenshot_feedback');
      }).catch(err => {
        devError('error', 'Screenshot capture failed', err);
        navigate('screenshot_feedback');
      });
    });
  },
  LB_DPAD_LEFT: () => {
    const current = get(splitRatio);
    const next = Math.max(20, current - 5);
    devLog('input', `LB+DPAD_LEFT → splitRatio ${current} → ${next}`);
    playToggle();
    splitRatio.set(next);
  },
  LB_DPAD_RIGHT: () => {
    const current = get(splitRatio);
    const next = Math.min(80, current + 5);
    devLog('input', `LB+DPAD_RIGHT → splitRatio ${current} → ${next}`);
    playToggle();
    splitRatio.set(next);
  },
  RT: () => {
    devLog('input', 'Global RT → switch to app window');
    playToggle();
    import('../system/windowManager').then(m => m.switchToApp());
  },
  LT: () => {
    devLog('input', 'Global LT → switch to DeckForge');
    playToggle();
    import('../system/windowManager').then(m => m.switchToDeckForge());
  },
  SELECT: () => {
    playToggle();
    import('../stores/terminal').then(({ activeTab }) => {
      const current = get(activeTab);
      const next = current === 'claude' ? 'app' : 'claude';
      activeTab.set(next);
      devLog('input', `Global SELECT → toggle terminal tab to ${next}`);
    });
  },
  R4: () => {
    devLog('input', 'Global R4 → run/restart app');
    playClick();
    Promise.all([
      import('../system/appLauncher'),
      import('../stores/configStores'),
    ]).then(([launcher, configStores]) => {
      if (launcher.isRunning()) {
        launcher.restartApp();
      } else {
        const config = get(configStores.projectConfig);
        const cmd = config?.run_config?.command;
        const cwd = config?.run_config?.working_directory || config?.project?.path || '.';
        if (cmd) {
          launcher.launchApp(cmd, cwd);
        } else {
          devLog('input', 'R4: no run command configured');
        }
      }
    });
  },
};

export function handleInput(button: string) {
  const screen = get(currentScreen);
  devLog('input', `Button: ${button} | Screen: ${screen}`);

  // Priority 1: On-screen keyboard captures ALL input when open
  if (get(keyboardOpen)) {
    devLog('input', `Keyboard open — ${button} captured by keyboard`);
    return; // Keyboard component handles its own input via keydown listener
  }

  // Priority 2: START menu captures ALL input when open
  if (get(startMenuOpen)) {
    devLog('input', `StartMenu open — ${button} captured by menu`);
    if (button === 'START' || button === 'B') {
      playMenuClose();
      startMenuOpen.set(false);
    } else if (button === 'A') {
      // A = Settings
      playClick();
      startMenuOpen.set(false);
      navigate('settings');
    } else if (button === 'X') {
      // X = Session Recap
      playClick();
      startMenuOpen.set(false);
      navigate('session_recap');
    } else if (button === 'Y') {
      // Y = Quit
      playClick();
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().close();
      }).catch(() => {
        devLog('input', 'StartMenu Y: not in Tauri, closing menu');
        startMenuOpen.set(false);
      });
    } else if (button === 'DPAD_UP' || button === 'DPAD_DOWN') {
      playNav();
      // Let StartMenu handle DPAD visually
    }
    return;
  }

  // Priority 3: START button opens the menu (except on screens that handle START themselves)
  if (button === 'START') {
    const screenHandlerMap = getScreenHandlers(screen);
    if (!screenHandlerMap['START']) {
      devLog('input', `${screen} → START → open menu`);
      playMenuOpen();
      startMenuOpen.set(true);
      return;
    }
  }

  const screenHandlerMap = getScreenHandlers(screen);

  // Screen-specific handlers take priority
  const screenHandler = screenHandlerMap[button];
  if (screenHandler) {
    devLog('input', `${screen} → ${button} pressed (screen handler)`);
    screenHandler();
    return;
  }

  // Fall through to global handlers
  const globalHandler = globalHandlers[button];
  if (globalHandler) {
    devLog('input', `${screen} → ${button} pressed (global handler)`);
    globalHandler();
  } else {
    devLog('input', `${screen} → ${button} pressed (no handler found)`);
  }
}
