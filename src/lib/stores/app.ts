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

export function navigate(screen: Screen) {
  currentScreen.set(screen);
  selectedCardIndex.set(0);
  screenCards.set([]);
}
