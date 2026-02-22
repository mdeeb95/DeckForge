import { writable, get } from 'svelte/store';
import { devLog } from '../utils/devLog';

export type Screen =
  | 'level1'
  | 'level2'
  | 'level3'
  | 'project_select'
  | 'empty_state'
  | 'ai_working'
  | 'qa_mode'
  | 'deploy_mode'
  | 'history'
  | 'exploration'
  | 'voice_pitch'
  | 'screenshot_feedback'
  | 'error'
  | 'settings'
  | 'session_recap';

export interface ScreenCardData {
  button?: string;    // only set for X/Y shortcut cards and secondary buttons
  title: string;
  description: string;
  onclick?: () => void;
}

export const currentScreen = writable<Screen>('level1');
export const projectName = writable('');
export const connected = writable(false);
export const selectedCardIndex = writable(0);

// Wrapped screenCards store that logs on set
function createScreenCardsStore() {
  const { subscribe, set: rawSet, update } = writable<ScreenCardData[]>([]);
  return {
    subscribe,
    set(cards: ScreenCardData[]) {
      devLog('store', `screenCards updated: ${cards.length} cards [${cards.map(c => c.button ?? '—').join(', ')}]`,
        cards.map(c => ({ button: c.button ?? '—', title: c.title, hasOnclick: !!c.onclick })));
      rawSet(cards);
    },
    update,
  };
}

export const screenCards = createScreenCardsStore();

// Secondary cards (LB, START, R4 etc.) — synced from ActionPalette props
export const secondaryScreenCards = writable<ScreenCardData[]>([]);

// Flash feedback: button name of the secondary card currently being pressed
export const pressedSecondaryButton = writable<string | null>(null);

// Split ratio: percentage of width for the terminal (left) panel. Min 20, max 80.
export const splitRatio = writable(50);

// Demo mode: when true, prediction client uses Pong-specific suggestions.
export const isDemoMode = writable(false);

// ─── Start Menu ──────────────────────────────────────────────────────────────

export const startMenuOpen = writable(false);

export function toggleStartMenu() {
  startMenuOpen.update(v => !v);
}

// ─── Settings Overlay ────────────────────────────────────────────────────────
// Settings is a modal overlay, not a screen. It renders on top of whatever
// screen is active without destroying it.

export const settingsOpen = writable(false);

export function openSettings() {
  devLog('nav', 'Opening settings overlay');
  settingsOpen.set(true);
}

export function closeSettings() {
  devLog('nav', 'Closing settings overlay');
  settingsOpen.set(false);
}

/** @deprecated Kept for inputRouter fallback — prefer closeSettings() */
export const previousScreen = writable<Screen>('empty_state');

// Pending prompt to send to Claude Code when AI Working screen mounts.
// Set by Level 3 "Ship It", consumed by AIWorkingScreen.
export const pendingClaudePrompt = writable<string | null>(null);

// ─── Cost Tracking ──────────────────────────────────────────────────────────

/** Accumulated cost for the current session in USD */
export const sessionCostUsd = writable(0);

/** Whether the budget warning has been shown this session */
export const budgetWarningShown = writable(false);

/**
 * Add cost from a prediction call. Triggers budget warning when threshold crossed.
 */
export function addSessionCost(costUsd: number, warningThreshold: number): void {
  if (!costUsd || costUsd <= 0) return;

  const prev = get(sessionCostUsd);
  const next = prev + costUsd;
  sessionCostUsd.set(next);

  if (next >= warningThreshold && !get(budgetWarningShown)) {
    budgetWarningShown.set(true);
    devLog('store', `Session cost ($${next.toFixed(4)}) exceeded warning threshold ($${warningThreshold})`);
  }
}

export function navigate(screen: Screen) {
  const current = get(currentScreen);
  devLog('nav', `Navigating: ${current} → ${screen}`);
  previousScreen.set(current);
  currentScreen.set(screen);
  selectedCardIndex.set(0);
  screenCards.set([]);
  secondaryScreenCards.set([]);
}
