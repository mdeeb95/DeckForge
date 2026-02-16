import { writable, get } from 'svelte/store';

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
  | 'error';

export interface ScreenCardData {
  button: string;
  title: string;
  description: string;
  onclick?: () => void;
}

export const currentScreen = writable<Screen>('level1');
export const projectName = writable('');
export const connected = writable(false);
export const selectedCardIndex = writable(0);
export const screenCards = writable<ScreenCardData[]>([]);

// Split ratio: percentage of width for the terminal (left) panel. Min 20, max 80.
export const splitRatio = writable(50);

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
    console.warn(`Session cost ($${next.toFixed(4)}) exceeded warning threshold ($${warningThreshold})`);
  }
}

export function navigate(screen: Screen) {
  currentScreen.set(screen);
  selectedCardIndex.set(0);
  screenCards.set([]);
}
