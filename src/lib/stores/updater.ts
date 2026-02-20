import { writable } from 'svelte/store';

export interface UpdateInfo {
  tagName: string;
  version: string;
  body: string;
  downloadUrl: string;
  downloadSize: number;
  publishedAt: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export const updateInfo = writable<UpdateInfo | null>(null);
export const updateStatus = writable<UpdateStatus>('idle');
export const updateError = writable<string | null>(null);
export const updateProgress = writable<number>(0);
