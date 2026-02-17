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

export interface ThinkingEntry {
  type: 'thinking';
  message: string;
}

export interface ToolCallEntry {
  type: 'tool_call';
  toolName: string;
  /** Colored CSS class for the tool header */
  headerClass: string;
  /** Primary parameter (file path, command, pattern) */
  summary: string;
  /** Optional code/content block below the header */
  content?: string;
  /** Whether content is a diff (show +/- coloring) */
  isDiff?: boolean;
  /** Optional line count or result summary */
  meta?: string;
}

export type TerminalEntry = TimestampEntry | PromptEntry | ThoughtEntry | CodeEntry | CursorEntry | ThinkingEntry | ToolCallEntry;

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
export const turns = writable(0);

export type TerminalTab = 'claude' | 'app';
export const activeTab = writable<TerminalTab>('claude');
