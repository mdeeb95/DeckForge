import { writable } from 'svelte/store';
import type { ScreenshotMeta } from '../types/data';

/** Triggers the flash overlay on screenshot capture */
export const screenshotFlash = writable(false);

/** Path to the most recently captured screenshot */
export const lastScreenshotPath = writable<string | null>(null);

/** Metadata for the most recently captured screenshot */
export const lastScreenshotMeta = writable<ScreenshotMeta | null>(null);
