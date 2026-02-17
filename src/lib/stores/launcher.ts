import { writable } from 'svelte/store';
import type { AppError } from '../system/appErrorClassifier';

// ─── App Launcher Reactive State ─────────────────────────────────────────────

/** Whether the user's app process is currently running */
export const appRunning = writable<boolean>(false);

/** PID of the running app process (null when not running) */
export const appPid = writable<number | null>(null);

/** Last error from launch/kill/restart (null when no error) */
export const lastLaunchError = writable<string | null>(null);

/** Captured stdout/stderr from the app process */
export const appOutput = writable<string[]>([]);

/** Classified app error when process exits abnormally */
export const appError = writable<AppError | null>(null);
