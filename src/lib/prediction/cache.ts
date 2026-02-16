import type {
  Category,
  CacheEntry,
  CacheDisplayState,
  PredictionResponse,
  ContextPayload,
} from './types';
import { computeCategoryHash } from './contextAssembler';

// ─── In-Memory Cache ─────────────────────────────────────────────────────────
// Mirrors the structure in .deckforge/cache/ but kept in-memory for speed.
// Written to disk when updated (Tauri only).

const memoryCache = new Map<Category, CacheEntry>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get cached suggestions for a category, or null if cache miss / stale.
 */
export function getCached(
  category: Category,
  context: ContextPayload,
): CacheEntry | null {
  const entry = memoryCache.get(category);
  if (!entry) return null;

  // Check if cache is stale via hash comparison
  const currentHash = computeCategoryHash(category, context);
  if (entry.invalidation_hash !== currentHash) {
    memoryCache.delete(category);
    return null;
  }

  return entry;
}

/**
 * Store a prediction response in the cache.
 */
export function setCached(
  category: Category,
  context: ContextPayload,
  response: PredictionResponse,
): CacheEntry {
  const entry: CacheEntry = {
    category,
    invalidation_hash: computeCategoryHash(category, context),
    cached_at: new Date().toISOString(),
    response,
    display_state: {
      current_pair_index: 0,
      pairs_exhausted: false,
      previously_shown_labels: [
        response.suggestions[0]?.label ?? '',
        response.suggestions[1]?.label ?? '',
      ].filter(Boolean),
    },
  };

  memoryCache.set(category, entry);
  writeCacheToDisk(category, entry);
  return entry;
}

/**
 * Get the current pair of suggestions to display (A and B buttons).
 * Returns [suggestionA, suggestionB] based on current_pair_index.
 */
export function getCurrentPair(entry: CacheEntry): [
  typeof entry.response.suggestions[0] | null,
  typeof entry.response.suggestions[1] | null,
] {
  const idx = entry.display_state.current_pair_index;
  const a = entry.response.suggestions[idx * 2] ?? null;
  const b = entry.response.suggestions[idx * 2 + 1] ?? null;
  return [a, b];
}

/**
 * Advance to the next pair of suggestions (RB reroll).
 * Returns true if advanced, false if pairs are exhausted (need fresh API call).
 */
export function advancePair(category: Category): boolean {
  const entry = memoryCache.get(category);
  if (!entry) return false;

  const maxPairs = Math.floor(entry.response.suggestions.length / 2);
  const nextIndex = entry.display_state.current_pair_index + 1;

  if (nextIndex >= maxPairs) {
    // All pairs exhausted
    entry.display_state.pairs_exhausted = true;
    memoryCache.set(category, entry);
    return false;
  }

  entry.display_state.current_pair_index = nextIndex;

  // Track shown labels
  const a = entry.response.suggestions[nextIndex * 2];
  const b = entry.response.suggestions[nextIndex * 2 + 1];
  if (a) entry.display_state.previously_shown_labels.push(a.label);
  if (b) entry.display_state.previously_shown_labels.push(b.label);

  entry.display_state.pairs_exhausted = false;
  memoryCache.set(category, entry);
  writeCacheToDisk(category, entry);
  return true;
}

/**
 * Get the display state for a category.
 */
export function getDisplayState(category: Category): CacheDisplayState | null {
  const entry = memoryCache.get(category);
  return entry?.display_state ?? null;
}

/**
 * Get all previously shown labels for a category (used in "do NOT repeat" prompts).
 */
export function getPreviouslyShownLabels(category: Category): string[] {
  const entry = memoryCache.get(category);
  return entry?.display_state.previously_shown_labels ?? [];
}

/**
 * Clear the cache for a specific category.
 */
export function clearCategory(category: Category): void {
  memoryCache.delete(category);
}

/**
 * Clear all caches.
 */
export function clearAll(): void {
  memoryCache.clear();
}

/**
 * Check if a category's pairs are exhausted (needs fresh API call on next reroll).
 */
export function isPairsExhausted(category: Category): boolean {
  const entry = memoryCache.get(category);
  return entry?.display_state.pairs_exhausted ?? true;
}

// ─── Disk persistence (Tauri only) ───────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function writeCacheToDisk(
  _category: Category,
  _entry: CacheEntry,
): Promise<void> {
  // TODO: Write to <project>/.deckforge/cache/<category>_suggestions.json
  // Requires project path context. For now, cache is in-memory only.
}
