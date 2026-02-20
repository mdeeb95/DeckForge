import { writable, get } from 'svelte/store';
import { rerollCount } from './prediction';
import { sessionCostUsd, budgetWarningShown } from './app';

export const sessionStartTime = writable<Date>(new Date());
export const sessionPromptCount = writable<number>(0);
export const sessionScreenshotCount = writable<number>(0);

/** Accumulates rerolls across the whole session (unlike rerollCount which resets per L2 entry) */
export const sessionRerollCount = writable<number>(0);

export function resetSession(): void {
  sessionStartTime.set(new Date());
  sessionPromptCount.set(0);
  sessionScreenshotCount.set(0);
  sessionRerollCount.set(0);
  rerollCount.set(0);
  sessionCostUsd.set(0);
  budgetWarningShown.set(false);
}

export function incrementPrompts(): void {
  sessionPromptCount.update(n => n + 1);
}

export function incrementScreenshots(): void {
  sessionScreenshotCount.update(n => n + 1);
}

export function incrementSessionRerolls(): void {
  sessionRerollCount.update(n => n + 1);
}
