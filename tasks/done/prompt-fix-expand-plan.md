# Task: Fix Expand Plan — Response Mapping + Rendering

## Goal

The "Tell Me More" / "Dig Deeper" feature on L3 (Plan Review) is broken. When the user presses X, the backend (langgraph) returns expanded plan data successfully, but the UI stays stuck at "EXPANDING (DEPTH 1) - Digging deeper into the plan..." and the expanded steps never render visibly.

## Root Cause

`remoteExpandPlan()` in `src/lib/prediction/client.ts` returns `await res.json()` **raw** — unlike every other backend call which has a mapper function (`mapBackendToPredictionResponse`, `mapBackendToPlanResponse`). The backend response structure doesn't match what Level3Screen expects.

Specifically:
1. Backend steps have `title` and `description` but **no `n` field** → `stepData.n` is `undefined`
2. Backend may not include `depth` or `commentary` at the top level
3. No validation or normalization of the response shape
4. New entries are added below the terminal scroll viewport but there's no auto-scroll

## Files to Modify

### 1. `src/lib/prediction/client.ts` — Add response mapper

Add a `mapBackendToExpandedPlanResponse()` function, matching the pattern of the other two mappers:

```typescript
function mapBackendToExpandedPlanResponse(
  data: Record<string, unknown>,
  depth: number,
): ExpandedPlanResponse {
  const rawSteps = (data.steps as Record<string, unknown>[]) ?? [];

  const steps = rawSteps.map((step, index) => ({
    n: (step.n as number) ?? index + 1,
    text: (step.text as string) ?? (step.title as string) ?? (step.description as string) ?? `Step ${index + 1}`,
    substeps: step.substeps as string[] | undefined,
    files_affected: step.files_affected as string[] | undefined,
    risks: step.risks as string[] | undefined,
    alternatives: step.alternatives as string[] | undefined,
    what_could_go_wrong: step.what_could_go_wrong as string | undefined,
    estimated_lines: step.estimated_lines as number | undefined,
    confidence_if_skipped: step.confidence_if_skipped as string | undefined,
    // Preserve any extra fields from backend
    title: step.title as string | undefined,
    description: step.description as string | undefined,
  }));

  return {
    depth: (data.depth as number) ?? depth,
    steps,
    commentary: (data.commentary as string) ?? `Expansion depth ${depth} complete.`,
  };
}
```

Update `remoteExpandPlan()` to use the mapper:

```typescript
async function remoteExpandPlan(
  plan: PlanResponse,
  context: ContextPayload,
  depth: number,
  token: string,
): Promise<ExpandedPlanResponse> {
  // ... existing fetch logic stays the same ...

  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  const data = await res.json();
  console.log('[expand-plan] Raw backend response:', JSON.stringify(data, null, 2));
  return mapBackendToExpandedPlanResponse(data, depth);
}
```

### 2. `src/lib/screens/Level3Screen.svelte` — Fix rendering + auto-scroll

Update the rendering logic in `expandPlan()` to handle the mapped response properly.

The key changes:

**a) Use mapped `n` field (now always present from mapper)**

The current code at line 159 does `const n = stepData.n as number` — this should now work because the mapper always provides `n`. But also render the step `title` and `description` from the backend if they exist:

```typescript
// Render expansion results to terminal
for (const step of expanded.steps) {
  const stepData = step as Record<string, unknown>;
  const n = (stepData.n as number) ?? 0;
  const title = (stepData.title as string) || (stepData.text as string) || '';
  const label = `STEP ${n} · DEPTH ${expandDepth}`;

  // Show step title/description if present (from langgraph)
  if (title) {
    entries.addEntry({
      type: 'timestamp',
      time: `${n}.`,
      message: title,
    });
  }

  // Show description as a separate thought if present and different from title
  const desc = stepData.description as string | undefined;
  if (desc && desc !== title) {
    entries.addEntry({
      type: 'thought',
      label,
      body: desc,
    });
  }

  if (stepData.substeps) {
    const subs = stepData.substeps as string[];
    entries.addEntry({
      type: 'thought',
      label: `${label} · SUBSTEPS`,
      body: subs.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    });
  }
  if (stepData.files_affected) {
    entries.addEntry({
      type: 'timestamp',
      time: `${n}.`,
      message: `Files: ${(stepData.files_affected as string[]).join(', ')}`,
    });
  }
  if (stepData.risks) {
    entries.addEntry({
      type: 'thought',
      label: `STEP ${n} RISKS`,
      body: (stepData.risks as string[]).join(' · '),
    });
  }
  if (stepData.alternatives) {
    entries.addEntry({
      type: 'thought',
      label: `ALT · STEP ${n}`,
      body: (stepData.alternatives as string[]).join('\n'),
    });
  }
  if (stepData.what_could_go_wrong) {
    entries.addEntry({
      type: 'thought',
      label: `WORST CASE · STEP ${n}`,
      body: stepData.what_could_go_wrong as string,
    });
  }
}
```

**b) Add debug logging**

At the top of the try block, right after getting `expanded`:

```typescript
console.log('[expand-plan] Parsed response:', {
  depth: expanded.depth,
  stepCount: expanded.steps.length,
  commentary: expanded.commentary,
  firstStep: expanded.steps[0],
});
```

**c) Improve error message**

In the catch block, log the full error:

```typescript
} catch (err) {
  console.error('[expand-plan] Expansion failed:', err);
  entries.addEntry({
    type: 'cursor',
    message: `Expansion failed: ${err}. Press X to try again.`,
  });
  expandDepth--; // allow retry at same depth
}
```

### 3. `src/lib/components/TerminalPanel.svelte` — Auto-scroll on new entries

The terminal panel needs to scroll to the bottom when new entries are added. If there isn't already a reactive scroll mechanism, add one:

Find the content container element (the one with `overflow-y-auto`). After entries change, scroll to the bottom:

```svelte
<script>
  // ... existing imports ...

  let contentEl: HTMLDivElement;

  // Auto-scroll when entries change
  $effect(() => {
    // Subscribe to entries
    const _ = $entries;
    // Tick to let DOM update, then scroll
    if (contentEl) {
      requestAnimationFrame(() => {
        contentEl.scrollTop = contentEl.scrollHeight;
      });
    }
  });
</script>
```

If auto-scroll already exists, verify it fires when entries are added programmatically (not just during streaming). The expand plan adds entries via `entries.addEntry()` outside the streaming flow, so the auto-scroll trigger might not fire.

### 4. `src/lib/prediction/types.ts` — Optionally tighten the type

The current `ExpandedPlanResponse.steps` type is `Record<string, unknown>[]` which is too loose. Consider adding a more specific type:

```typescript
export interface ExpandedStep {
  n: number;
  text: string;
  title?: string;
  description?: string;
  substeps?: string[];
  files_affected?: string[];
  risks?: string[];
  alternatives?: string[];
  what_could_go_wrong?: string;
  estimated_lines?: number;
  confidence_if_skipped?: string;
}

export interface ExpandedPlanResponse {
  depth: number;
  steps: ExpandedStep[];
  commentary: string;
}
```

Then update the rendering code in Level3Screen to use the typed interface instead of casting to `Record<string, unknown>`.

## Mock Data Validation

The existing `getMockExpandedPlan()` function in client.ts (line 632-674) already returns steps with `n` field, so mock mode works fine. The bug is **only** in the remote path where the mapper is missing.

After the fix, verify:
- Mock mode still works (no auth token → falls back to mock)
- Remote mode works (auth token present → uses mapper)
- Both paths render step data in the terminal
- Terminal scrolls to show new entries

## Verification

1. Open DeckForge, go to L3 with a plan loaded
2. Press X (Tell Me More) — should show "EXPANDING (DEPTH 1)" then render expanded steps below it
3. Each step should show: title, description, substeps (numbered), files affected, risks
4. Terminal should auto-scroll to show the new entries
5. Press X again — DEPTH 2 should work with alternatives and estimated lines
6. Press X a third time — DEPTH 3 with worst-case scenarios
7. Check browser console for `[expand-plan]` debug logs showing the raw and parsed response
8. If backend is down, mock fallback should still work
