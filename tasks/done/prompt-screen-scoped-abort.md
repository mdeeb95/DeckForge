# Task: Screen-Scoped Network Cancellation (AbortController)

## Goal

Every async network call should be tied to the screen that initiated it. When the user navigates away, all in-flight requests for that screen are **instantly cancelled** — no orphaned promises writing to stores, no stale data pollution, no race conditions.

Currently there are **zero AbortControllers** in the entire codebase. Every `fetch()` in the prediction client is fire-and-forget. If the user presses B during an expand plan call, the promise resolves seconds later and writes entries to a terminal that's already showing a different screen.

## Architecture

### Pattern: Screen AbortController

Each screen creates an `AbortController` on mount and aborts it on destroy:

```typescript
import { onMount, onDestroy } from 'svelte';

let abortController: AbortController;

onMount(() => {
  abortController = new AbortController();
});

onDestroy(() => {
  abortController.abort();
});
```

The controller's `signal` is passed to every async call the screen makes. When the signal fires, `fetch()` throws `AbortError` automatically — no extra logic needed.

## Files to Modify

### 1. `src/lib/prediction/client.ts` — Accept AbortSignal in all functions

Every public function and every remote function needs an optional `signal` parameter, passed through to `fetch()`.

**Public API:**

```typescript
export async function predictSuggestions(
  category: Category,
  context: ContextPayload,
  signal?: AbortSignal,  // ← NEW
): Promise<PredictionResponse> {
  const token = getAccessToken();
  if (token) {
    try {
      return await remotePredictSuggestions(category, context, token, signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e; // don't fall back to mock on abort
      console.warn('Remote prediction failed, falling back to mock:', e);
    }
  }
  return mockPredictSuggestions(category);
}

export async function generatePlan(
  suggestion: Suggestion,
  context: ContextPayload,
  signal?: AbortSignal,  // ← NEW
): Promise<PlanResponse> {
  // same pattern — pass signal, rethrow AbortError
}

export async function expandPlanRemote(
  plan: PlanResponse,
  context: ContextPayload,
  depth: number,
  signal?: AbortSignal,  // ← NEW
): Promise<ExpandedPlanResponse> {
  // same pattern
}
```

**Remote functions — pass signal to fetch:**

```typescript
async function remotePredictSuggestions(
  category: Category,
  context: ContextPayload,
  token: string,
  signal?: AbortSignal,
): Promise<PredictionResponse> {
  // ...
  let res = await fetch(`${backendUrl}/api/v1/predict`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify(body),
    signal,  // ← ADD THIS
  });

  // On 401 retry — also pass signal
  if (res.status === 401) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      res = await fetch(`${backendUrl}/api/v1/predict`, {
        method: 'POST',
        headers: { ... },
        body: JSON.stringify(body),
        signal,  // ← ADD THIS
      });
    }
  }
  // ...
}
```

Do the same for `remoteGeneratePlan()` and `remoteExpandPlan()`.

**Important:** When catching errors, distinguish `AbortError` from real failures. AbortError should **not** fall back to mock data — it should propagate so the caller knows the request was intentionally cancelled:

```typescript
if (e instanceof DOMException && e.name === 'AbortError') throw e;
```

### 2. `src/lib/stores/prediction.ts` — Accept signal in store actions

Find `loadPredictions()` and `selectAndPlan()` (or wherever the stores call the prediction client). Pass the signal through.

If these are standalone functions exported from the store file:

```typescript
export async function loadPredictions(
  category: Category,
  signal?: AbortSignal,
) {
  predictionsLoading.set(true);
  try {
    const context = await buildContextPayload(...);
    const response = await predictSuggestions(category, context, signal);

    // Guard: check if aborted before writing stores
    if (signal?.aborted) return;

    currentPrediction.set(response);
    // ...set pair stores...
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // silently bail
    console.error('Prediction failed:', e);
  } finally {
    if (!signal?.aborted) predictionsLoading.set(false);
  }
}
```

The `signal?.aborted` guard is a belt-and-suspenders check — even though `fetch` already threw, the guard protects any code between the `await` and the store writes.

### 3. `src/lib/screens/Level1Screen.svelte` — Mount/destroy lifecycle

```typescript
import { onMount, onDestroy } from 'svelte';

let abortController: AbortController;

onMount(() => {
  abortController = new AbortController();
});

onDestroy(() => {
  abortController.abort();
});
```

Pass `abortController.signal` to any async call this screen makes (e.g., if it calls `loadPredictions`).

### 4. `src/lib/screens/Level2Screen.svelte` — Same pattern

```typescript
let abortController: AbortController;

onMount(() => {
  abortController = new AbortController();
  // Pass signal to prediction loading
  loadPredictions(category, abortController.signal);
});

onDestroy(() => {
  abortController.abort();
});
```

If `selectAndPlan()` is called from L2, pass the signal:

```typescript
function handleSelect(suggestion) {
  selectAndPlan(suggestion, abortController.signal);
}
```

### 5. `src/lib/screens/Level3Screen.svelte` — Abort expand plan

```typescript
let abortController: AbortController;

onMount(() => {
  abortController = new AbortController();
});

onDestroy(() => {
  abortController.abort();
});
```

In `expandPlan()`, pass the signal:

```typescript
async function expandPlan() {
  // ...existing debounce and animation...

  try {
    const { expandPlanRemote } = await import('../prediction/client');
    // ...

    let expanded;
    if (config) {
      const context = await buildContextPayload(config, behavior);
      expanded = await expandPlanRemote(plan, context, expandDepth, abortController.signal);
    } else {
      expanded = await expandPlanRemote(plan, {} as any, expandDepth, abortController.signal);
    }

    // If aborted between fetch and rendering, bail
    if (abortController.signal.aborted) return;

    // ...render entries...

  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User navigated away — silently bail, don't log error
      return;
    }
    console.error('[expand-plan] Expansion failed:', err);
    entries.addEntry({
      type: 'cursor',
      message: `Expansion failed: ${err}. Press X to try again.`,
    });
    expandDepth--;
  }

  // Only update UI state if still on this screen
  if (!abortController.signal.aborted) {
    status.set('idle');
    isExpanding = false;
  }
}
```

### 6. `src/lib/screens/AIWorkingScreen.svelte` — Guard the onOutput callback

AIWorkingScreen already has partial cleanup (intervals). Add the abort controller and guard the `onOutput` callback:

```typescript
let abortController: AbortController;

onMount(() => {
  abortController = new AbortController();
});

onDestroy(() => {
  abortController.abort();
  if (elapsedInterval) clearInterval(elapsedInterval);
  if (messageInterval) clearInterval(messageInterval);
});
```

In the `onOutput` callback that processes Claude Code events:

```typescript
function handleOutput(event) {
  if (abortController.signal.aborted) return; // screen was destroyed
  // ...existing event processing...
}
```

**Note:** The Claude Code subprocess itself should NOT be killed on screen navigation — the AI task should continue running in the background. Only the UI callback should stop writing to stores. The subprocess lifecycle is managed separately (user can return to the screen or check results later).

## What This Does NOT Change

- **Mock fallbacks** — Mock functions don't use fetch, so they don't need AbortSignal. But the abort guard before store writes protects against mocks completing after navigation too.
- **Claude Code subprocess** — The actual AI task keeps running. Only the onOutput handler stops writing to UI stores.
- **Backend** — No backend changes needed. Aborted fetch simply closes the HTTP connection; the server may finish processing but the response is discarded client-side.

## Edge Cases

1. **Quick B-B-B navigation** — Each screen mount creates a fresh AbortController. Previous screen's controller is aborted. No stale writes possible.
2. **Token refresh during abort** — If `refreshAuth()` is in progress when abort fires, the subsequent fetch will throw AbortError immediately. Clean.
3. **Mock mode** — `signal?.aborted` guard catches mock completions that arrive after navigation. Mock functions complete synchronously-ish (with `delay()`), but the guard still protects.
4. **Multiple X presses on L3** — The `isExpanding` debounce still works. AbortController is per-screen, not per-request, so all expand requests for that L3 instance share one signal.

## Verification

1. Go to L2, wait for predictions to start loading, press B immediately → No console errors, no stale data appearing on L1
2. Go to L3, press X to expand, press B quickly → No "EXPANDING" entries appearing on the L2 terminal
3. Go to L3, press A to ship it, while AI is working navigate away → AI task continues running (check `claude` process), but no terminal spam when you return
4. Open browser console — look for `AbortError` being caught silently (no red errors, no "failed" messages for intentional cancels)
5. Go to L2 and rapidly switch categories — only the latest category's results should appear, previous fetches should be cancelled
