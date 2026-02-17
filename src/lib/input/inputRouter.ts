import { get } from 'svelte/store';
import { currentScreen, navigate, splitRatio, pendingClaudePrompt, startMenuOpen, previousScreen, keyboardOpen } from '../stores/app';
import type { Screen } from '../stores/app';
import { navigateUp, navigateDown, activateByButton, cycleSelectedIndex } from './navigation';
import { rerollSuggestions } from '../stores/prediction';
import { screenshotFlash, lastScreenshotPath, lastScreenshotMeta } from '../stores/screenshot';
import { devLog, devError } from '../utils/devLog';

type HandlerMap = Record<string, () => void>;

function getScreenHandlers(screen: Screen): HandlerMap {
  switch (screen) {
    // ── Level 1: Category Select ──────────────────────────────────
    // A/B/X/Y = select category → Level 2. Menu = QA Mode. View = History.
    case 'level1':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        START: () => {
          // Block navigation during error recovery — user should resolve the error first
          import('../stores/launcher').then(({ appError }) => {
            if (!get(appError)) navigate('qa_mode');
          });
        },
        SELECT: () => navigate('history'),
      };

    // ── Level 2: Suggestions ──────────────────────────────────────
    // A = select suggestion A → Level 3. B = select suggestion B → Level 3.
    // RB = reroll (cycle through cached suggestion pairs). LB = back.
    // X = modifier. Y = wild card → Level 3.
    case 'level2':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        RB: () => rerollSuggestions(),
        LB: () => navigate('level1'),
      };

    // ── Level 3: Plan Confirmation ────────────────────────────────
    // A = "Ship it" → AI Working. B = reject → Level 2.
    // X = expand plan. Y = ship unhinged → AI Working.
    case 'level3':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        LB: () => activateByButton('B'),
      };

    // ── AI Working ────────────────────────────────────────────────
    // B = interrupt (with confirmation). All others disabled.
    case 'ai_working':
      return {
        B: () => navigate('level1'),
      };

    // ── QA Mode ───────────────────────────────────────────────────
    // A = approve → Deploy. B = back to Level 1. X = run tests. Y = view diff.
    // D-pad navigates.
    case 'qa_mode':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => navigate('deploy_mode'),
        B: () => navigate('level1'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
      };

    // ── Deploy Mode ───────────────────────────────────────────────
    // A = push and deploy. B = preview. X = push only. Y = review changes.
    // Menu = back to Level 1.
    case 'deploy_mode':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        RB: () => activateByButton('RB'),
        LB: () => activateByButton('LB'),
        START: () => navigate('level1'),
      };

    // ── History ───────────────────────────────────────────────────
    // A = preview. B = back to Level 1. Y = rollback.
    case 'history':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => navigate('level1'),
        Y: () => activateByButton('Y'),
      };

    // ── Project Select ────────────────────────────────────────────
    // A/B/X/Y = open project via screenCards onclick. RB/LB = browse for project.
    case 'project_select':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        RB: () => activateByButton('RB'),
        LB: () => activateByButton('LB'),
      };

    // ── Empty State ───────────────────────────────────────────────
    // A = open directory. X = exploration. Y = new project. LB = settings.
    case 'empty_state':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        LB: () => navigate('settings'),
      };

    // ── Exploration ───────────────────────────────────────────────
    // A = build. B = back. X = more. Y = shuffle.
    // D-pad left/right = categories, up/down = within category.
    case 'exploration':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        DPAD_LEFT: navigateUp,
        DPAD_RIGHT: navigateDown,
        A: () => activateByButton('A'),
        B: () => navigate('project_select'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
      };

    // ── Voice Pitch ───────────────────────────────────────────────
    // A = confirm/start. B = cancel/back. Y = re-record.
    case 'voice_pitch':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        Y: () => activateByButton('Y'),
      };

    // ── Screenshot Feedback ─────────────────────────────────────
    // A = send to Claude. B = discard. X = voice annotate. Y = send + new task.
    // LB = back.
    case 'screenshot_feedback':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        LB: () => navigate('level1'),
      };

    // ── Error ─────────────────────────────────────────────────────
    // A = retry. B = undo. X = view details. Y = ignore.
    case 'error':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
      };

    // ── Settings Hub ───────────────────────────────────────────────
    // A/B/X/Y = navigate to sub-screen. START/LB = close settings.
    case 'settings':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        START: () => navigate(get(previousScreen) || 'empty_state'),
        LB: () => navigate(get(previousScreen) || 'empty_state'),
      };

    // ── Settings Sub-Screens ───────────────────────────────────────
    // A/B/X/Y = act on card. LB = back to hub.
    case 'settings_prediction':
    case 'settings_display':
    case 'settings_telemetry':
    case 'settings_advanced':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => activateByButton('B'),
        X: () => activateByButton('X'),
        Y: () => activateByButton('Y'),
        LB: () => navigate('settings'),
        START: () => navigate(get(previousScreen) || 'empty_state'),
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
  RB: () => {
    devLog('input', 'Global RB → screenshot capture');
    screenshotFlash.set(true);
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
    splitRatio.set(next);
  },
  LB_DPAD_RIGHT: () => {
    const current = get(splitRatio);
    const next = Math.min(80, current + 5);
    devLog('input', `LB+DPAD_RIGHT → splitRatio ${current} → ${next}`);
    splitRatio.set(next);
  },
  RT: () => {
    devLog('input', 'Global RT → switch to app window');
    import('../system/windowManager').then(m => m.switchToApp());
  },
  LT: () => {
    devLog('input', 'Global LT → switch to DeckForge');
    import('../system/windowManager').then(m => m.switchToDeckForge());
  },
  SELECT: () => {
    import('../stores/terminal').then(({ activeTab }) => {
      const current = get(activeTab);
      const next = current === 'claude' ? 'app' : 'claude';
      activeTab.set(next);
      devLog('input', `Global SELECT → toggle terminal tab to ${next}`);
    });
  },
  R4: () => {
    devLog('input', 'Global R4 → run/restart app');
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
      startMenuOpen.set(false);
    } else if (button === 'A') {
      // A = Settings
      startMenuOpen.set(false);
      navigate('settings');
    } else if (button === 'Y') {
      // Y = Quit
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().close();
      }).catch(() => {
        devLog('input', 'StartMenu Y: not in Tauri, closing menu');
        startMenuOpen.set(false);
      });
    } else if (button === 'DPAD_UP' || button === 'DPAD_DOWN') {
      // Let StartMenu handle DPAD visually — no-op in inputRouter
    }
    return;
  }

  // Priority 3: START button opens the menu (except on screens that handle START themselves)
  if (button === 'START') {
    const screenHandlerMap = getScreenHandlers(screen);
    if (!screenHandlerMap['START']) {
      devLog('input', `${screen} → START → open menu`);
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
