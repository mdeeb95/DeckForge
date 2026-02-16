/**
 * Prediction cache tests — verifies setCached/getCached, hash invalidation,
 * getCurrentPair, advancePair cycling, clearCategory, and clearAll.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setCached,
  getCached,
  getCurrentPair,
  advancePair,
  clearCategory,
  clearAll,
} from '$lib/prediction/cache';
import type { ContextPayload, PredictionResponse, Suggestion } from '$lib/prediction/types';

function makeSuggestion(label: string): Suggestion {
  return {
    label,
    quip: `quip for ${label}`,
    scope: 'quick tweak',
    rationale: 'test',
  };
}

function makeResponse(count: number): PredictionResponse {
  return {
    header_quip: 'test quip',
    suggestions: Array.from({ length: count }, (_, i) => makeSuggestion(`s${i}`)),
    modifier: { lens: 'test', quip: 'mod' },
    wild_card: { label: 'wild', quip: 'wild quip', scope: 'quick tweak', rationale: 'wild' },
  };
}

function makeContext(overrides: Partial<ContextPayload> = {}): ContextPayload {
  return {
    project: { name: 'test', type_detected: 'web', created_at: '', session_number: 1, total_ai_tasks_completed: 0 },
    file_tree: { summary: '10 files', top_level: ['src/'], largest_files: [], recently_modified: [] },
    git_history: { recent_commits: [], current_branch: 'main', uncommitted_changes: false, total_deckforge_commits: 0 },
    detected_features: ['auth'],
    detected_gaps: [],
    current_errors: [],
    tech_stack: { framework: 'svelte', build_tool: 'vite', language: 'typescript', dependencies: [] },
    user_behavior: { categories_selected: {}, rerolls_per_session_avg: 0, plans_rejected_pct: 0, last_category: null, preferred_complexity: 'medium', voice_usage_count: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  clearAll();
});

describe('setCached() and getCached()', () => {
  it('stores and retrieves a cache entry', () => {
    const ctx = makeContext();
    const response = makeResponse(8);
    setCached('feature', ctx, response);

    const cached = getCached('feature', ctx);
    expect(cached).not.toBeNull();
    expect(cached!.response.suggestions).toHaveLength(8);
  });

  it('returns null when hash changes (invalidation)', () => {
    const ctx1 = makeContext({ detected_features: ['auth'] });
    const ctx2 = makeContext({ detected_features: ['auth', 'payments'] });
    setCached('feature', ctx1, makeResponse(8));

    const cached = getCached('feature', ctx2);
    expect(cached).toBeNull();
  });
});

describe('getCurrentPair()', () => {
  it('returns correct pair for current_pair_index', () => {
    const ctx = makeContext();
    const response = makeResponse(8);
    const entry = setCached('feature', ctx, response);

    const [a, b] = getCurrentPair(entry);
    expect(a!.label).toBe('s0');
    expect(b!.label).toBe('s1');
  });
});

describe('advancePair()', () => {
  it('cycles through pairs 0-3 then returns false', () => {
    const ctx = makeContext();
    setCached('feature', ctx, makeResponse(8)); // 8 suggestions = 4 pairs

    expect(advancePair('feature')).toBe(true);  // pair 1
    expect(advancePair('feature')).toBe(true);  // pair 2
    expect(advancePair('feature')).toBe(true);  // pair 3
    expect(advancePair('feature')).toBe(false); // exhausted
  });
});

describe('clearCategory()', () => {
  it('only clears the specified category', () => {
    const ctx = makeContext();
    setCached('feature', ctx, makeResponse(8));
    setCached('bug', ctx, makeResponse(8));

    clearCategory('feature');
    expect(getCached('feature', ctx)).toBeNull();
    expect(getCached('bug', ctx)).not.toBeNull();
  });
});

describe('clearAll()', () => {
  it('empties everything', () => {
    const ctx = makeContext();
    setCached('feature', ctx, makeResponse(8));
    setCached('bug', ctx, makeResponse(8));

    clearAll();
    expect(getCached('feature', ctx)).toBeNull();
    expect(getCached('bug', ctx)).toBeNull();
  });
});
