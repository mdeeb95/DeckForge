import { writable } from 'svelte/store';

export type TerminalStatus = 'streaming' | 'idle' | 'complete' | 'error';

export interface TimestampEntry {
  type: 'timestamp';
  time: string;
  message: string;
}

export interface PromptEntry {
  type: 'prompt';
  label: string;
  body: string;
}

export interface ThoughtEntry {
  type: 'thought';
  label: string;
  body: string;
}

export interface CodeEntry {
  type: 'code';
  filePath?: string;
  content: string;
  diff?: boolean;
}

export interface CursorEntry {
  type: 'cursor';
  message: string;
}

export type TerminalEntry = TimestampEntry | PromptEntry | ThoughtEntry | CodeEntry | CursorEntry;

function createTerminalStore() {
  const { subscribe, update, set } = writable<TerminalEntry[]>([]);

  return {
    subscribe,
    addEntry(entry: TerminalEntry) {
      update(entries => [...entries, entry]);
    },
    clear() {
      set([]);
    },
  };
}

export const entries = createTerminalStore();
export const status = writable<TerminalStatus>('idle');
export const cost = writable('$0.00');
export const scope = writable('');
