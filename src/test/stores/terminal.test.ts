/**
 * Terminal store tests — verifies addEntry(), clear(), initial state,
 * and that all 5 entry types are accepted.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { entries, type TerminalEntry } from '$lib/stores/terminal';

beforeEach(() => {
  entries.clear();
});

describe('addEntry()', () => {
  it('appends to the entries array', () => {
    entries.addEntry({ type: 'timestamp', time: '10:00', message: 'hello' });
    entries.addEntry({ type: 'timestamp', time: '10:01', message: 'world' });
    expect(get(entries)).toHaveLength(2);
  });
});

describe('clear()', () => {
  it('empties the entries array', () => {
    entries.addEntry({ type: 'timestamp', time: '10:00', message: 'test' });
    entries.clear();
    expect(get(entries)).toEqual([]);
  });
});

describe('initial state', () => {
  it('entries starts empty (no duplication bug)', () => {
    expect(get(entries)).toEqual([]);
  });
});

describe('entry types', () => {
  it('all 5 entry types are accepted', () => {
    const testEntries: TerminalEntry[] = [
      { type: 'timestamp', time: '10:00', message: 'ts' },
      { type: 'prompt', label: 'TASK', body: 'do something' },
      { type: 'thought', label: 'Thinking', body: 'analyzing...' },
      { type: 'code', content: 'const x = 1;', diff: false },
      { type: 'cursor', message: 'Awaiting...' },
    ];

    for (const entry of testEntries) {
      entries.addEntry(entry);
    }

    const all = get(entries);
    expect(all).toHaveLength(5);
    expect(all.map(e => e.type)).toEqual([
      'timestamp', 'prompt', 'thought', 'code', 'cursor',
    ]);
  });
});
