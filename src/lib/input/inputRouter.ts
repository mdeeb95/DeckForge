import { get } from 'svelte/store';
import { currentScreen, navigate, splitRatio } from '../stores/app';
import type { Screen } from '../stores/app';
import { navigateUp, navigateDown, activateByButton, cycleSelectedIndex } from './navigation';
import { rerollSuggestions } from '../stores/prediction';

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
        START: () => navigate('qa_mode'),
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
        A: () => navigate('ai_working'),
        B: () => navigate('level2'),
        X: () => activateByButton('X'),
        Y: () => navigate('ai_working'),
        LB: () => navigate('level2'),
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
    // A = open project → Level 1. B = delete. X = exploration. Y = new project.
    case 'project_select':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => navigate('level1'),
        B: () => activateByButton('B'),
        X: () => navigate('exploration'),
        Y: () => navigate('voice_pitch'),
      };

    // ── Empty State ───────────────────────────────────────────────
    // A = open directory. X = exploration. Y = new project.
    case 'empty_state':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        X: () => navigate('exploration'),
        Y: () => navigate('voice_pitch'),
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
    // A = confirm. B = re-record/back.
    case 'voice_pitch':
      return {
        DPAD_UP: navigateUp,
        DPAD_DOWN: navigateDown,
        A: () => activateByButton('A'),
        B: () => navigate('project_select'),
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

    default:
      return {};
  }
}

// ── Global handlers (active on ALL screens) ─────────────────────────
// LB + D-pad left/right adjusts split ratio (5% increments, min 20%, max 80%).
const globalHandlers: HandlerMap = {
  LB_DPAD_LEFT: () => {
    const current = get(splitRatio);
    splitRatio.set(Math.max(20, current - 5));
  },
  LB_DPAD_RIGHT: () => {
    const current = get(splitRatio);
    splitRatio.set(Math.min(80, current + 5));
  },
};

export function handleInput(button: string) {
  const screen = get(currentScreen);
  const screenHandlerMap = getScreenHandlers(screen);

  // Screen-specific handlers take priority
  const screenHandler = screenHandlerMap[button];
  if (screenHandler) {
    screenHandler();
    return;
  }

  // Fall through to global handlers
  const globalHandler = globalHandlers[button];
  if (globalHandler) {
    globalHandler();
  }
}
