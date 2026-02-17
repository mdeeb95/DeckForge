import { writable } from 'svelte/store';

export interface ErrorDetails {
  message: string;
  type: string;
  file: string | null;
  output: string;
  recoverable: boolean;
  timestamp: string;
}

export const errorDetails = writable<ErrorDetails | null>(null);

export function setError(details: ErrorDetails): void {
  errorDetails.set(details);
}

export function clearError(): void {
  errorDetails.set(null);
}
