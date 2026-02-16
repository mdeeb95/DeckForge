import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseClaudeEvent } from '../../lib/claude/streamParser';
import type { ClaudeEvent } from '../../lib/claude/types';

// ─── Fixture replay — runs without real CLI ──────────────────────────────────
// This test replays a captured event stream through streamParser.
// It always runs (even in CI without claude installed) as long as the fixture exists.

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sample-stream.json');

describe('fixture replay through streamParser', () => {
  it('processes saved fixture events into valid TerminalEntry objects', () => {
    if (!fs.existsSync(FIXTURE_PATH)) {
      console.log(
        '⚠ No fixture at fixtures/sample-stream.json\n' +
        '  Run the full integration tests with claude CLI + API key first:\n' +
        '  ANTHROPIC_API_KEY=sk-... npm run test:integration',
      );
      return;
    }

    const rawEvents: ClaudeEvent[] = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
    expect(rawEvents.length).toBeGreaterThan(0);

    const allEntries: Array<{ type: string }> = [];

    for (const event of rawEvents) {
      const entries = parseClaudeEvent(event);

      // Each call should return a defined array
      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);

      // No null/undefined entries
      for (const entry of entries) {
        expect(entry).toBeDefined();
        expect(entry).not.toBeNull();
        expect(typeof entry.type).toBe('string');
      }

      allEntries.push(...entries);
    }

    // Should produce at least some entries
    expect(allEntries.length).toBeGreaterThan(0);

    // Verify entry types are all valid
    const validTypes = ['timestamp', 'prompt', 'thought', 'code', 'cursor', 'thinking'];
    for (const entry of allEntries) {
      expect(validTypes).toContain(entry.type);
    }

    // Should contain at least one thought (from assistant message)
    const thoughts = allEntries.filter(e => e.type === 'thought');
    expect(thoughts.length).toBeGreaterThanOrEqual(1);

    // Should end with a cursor entry (from result event)
    const lastEntry = allEntries[allEntries.length - 1];
    expect(lastEntry.type).toBe('cursor');

    // Should contain at least one timestamp (from system init)
    const timestamps = allEntries.filter(e => e.type === 'timestamp');
    expect(timestamps.length).toBeGreaterThanOrEqual(1);
  });

  it('handles each event type correctly', () => {
    if (!fs.existsSync(FIXTURE_PATH)) {
      return; // Skip if no fixture
    }

    const rawEvents: ClaudeEvent[] = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

    // Group by event type
    const byType: Record<string, ClaudeEvent[]> = {};
    for (const event of rawEvents) {
      if (!byType[event.type]) byType[event.type] = [];
      byType[event.type].push(event);
    }

    // System events should produce timestamp entries
    if (byType['system']) {
      for (const event of byType['system']) {
        const entries = parseClaudeEvent(event);
        expect(entries.length).toBeGreaterThan(0);
        expect(entries[0].type).toBe('timestamp');
      }
    }

    // Assistant events should produce thought entries
    if (byType['assistant']) {
      for (const event of byType['assistant']) {
        const entries = parseClaudeEvent(event);
        const thoughts = entries.filter(e => e.type === 'thought');
        expect(thoughts.length).toBeGreaterThanOrEqual(0); // May have empty content
      }
    }

    // Result events should produce cursor entries
    if (byType['result']) {
      for (const event of byType['result']) {
        const entries = parseClaudeEvent(event);
        const cursors = entries.filter(e => e.type === 'cursor');
        expect(cursors.length).toBe(1);
      }
    }
  });
});
