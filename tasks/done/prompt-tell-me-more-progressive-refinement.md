# Tell Me More — Progressive Plan Refinement

## What
Transform the "Tell Me More" (X button) on Level 3 from a static one-shot expansion into a progressive refinement system. Each press of X sends the plan back to the prediction engine for deeper expansion, appending new detail layers to the terminal. The user can keep hitting X to see how deep the rabbit hole goes.

## Why
Currently `expandPlan()` in Level3Screen.svelte just re-renders the same cached plan data every time X is pressed. No backend call, no new information, just duplicate entries. The backend already has a `level_3_expand` call type with a template that returns substeps, files_affected, and risks — it's just never called from the frontend.

## Files to Modify

### 1. `src/lib/prediction/client.ts` — Add `expandPlan()` API function

Add a new public function below `generatePlan()`:

```typescript
/**
 * Expand a plan with more detail. Each call deepens the plan.
 * Uses the level_3_expand backend call type.
 */
export async function expandPlanRemote(
  plan: PlanResponse,
  context: ContextPayload,
  depth: number,
): Promise<ExpandedPlanResponse> {
  const token = getAccessToken();
  if (token) {
    try {
      return await remoteExpandPlan(plan, context, depth, token);
    } catch (e) {
      console.warn('Remote plan expansion failed, falling back to mock:', e);
    }
  }
  return getMockExpandedPlan(plan, depth);
}
```

Add the remote call function:

```typescript
async function remoteExpandPlan(
  plan: PlanResponse,
  context: ContextPayload,
  depth: number,
  token: string,
): Promise<ExpandedPlanResponse> {
  const backendUrl = getBackendUrl();

  const body = {
    call_type: 'level_3_expand',
    context_payload: context,
    original_plan: JSON.stringify({
      summary: plan.summary,
      steps: plan.steps,
      scope: plan.scope,
      confidence: plan.confidence,
    }),
    depth,
  };

  let res = await fetch(`${backendUrl}/api/v1/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      res = await fetch(`${backendUrl}/api/v1/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshed.access_token}`,
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return await res.json();
}
```

Add mock expansion for when backend is unavailable:

```typescript
function getMockExpandedPlan(plan: PlanResponse, depth: number): ExpandedPlanResponse {
  const flavorByDepth = [
    // depth 1 — substeps
    plan.steps.map(s => ({
      n: s.n,
      text: s.text,
      substeps: [
        `Check existing code for conflicts with step ${s.n}`,
        `Implement the core logic for: ${s.text.toLowerCase()}`,
        `Add error handling and edge cases`,
      ],
      files_affected: ['src/lib/components/...', 'src/lib/stores/...'],
      risks: ['May need refactoring if current patterns differ'],
    })),
    // depth 2 — alternative approaches
    plan.steps.map(s => ({
      n: s.n,
      text: s.text,
      alternatives: [
        `Could also be done by modifying the store layer instead`,
        `A simpler approach: skip this step and handle it in step ${Math.min(s.n + 1, plan.steps.length)}`,
      ],
      estimated_lines: Math.floor(Math.random() * 80) + 20,
    })),
    // depth 3 — wild speculation
    plan.steps.map(s => ({
      n: s.n,
      text: s.text,
      what_could_go_wrong: `If this step fails, the whole ${plan.scope} scope might need rethinking`,
      confidence_if_skipped: 'low',
      fun_fact: `This is the kind of step that looks easy until you actually start coding it`,
    })),
  ];

  const idx = Math.min(depth - 1, flavorByDepth.length - 1);
  return {
    depth,
    steps: flavorByDepth[idx],
    commentary: depth >= 3
      ? "You're really digging deep. At this point you might just want to ship it and see what happens."
      : `Expansion depth ${depth} — press X again for more detail.`,
  };
}
```

### 2. `src/lib/prediction/types.ts` — Add ExpandedPlanResponse type

```typescript
export interface ExpandedPlanResponse {
  depth: number;
  steps: Record<string, unknown>[];
  commentary: string;
}
```

### 3. `src/lib/screens/Level3Screen.svelte` — Wire up progressive expansion

Replace the `expandPlan()` function (lines 81-126) with:

```typescript
let expandDepth = $state(0);
let isExpanding = $state(false);

async function expandPlan() {
  if (!plan) {
    entries.addEntry({ type: 'cursor', message: 'No plan to expand.' });
    return;
  }
  if (isExpanding) return; // debounce

  isExpanding = true;
  expandDepth++;
  status.set('streaming');

  entries.addEntry({
    type: 'prompt',
    label: `EXPANDING (DEPTH ${expandDepth})`,
    body: expandDepth === 1
      ? 'Digging deeper into the plan...'
      : expandDepth === 2
        ? 'Going even deeper...'
        : expandDepth === 3
          ? 'How deep does this rabbit hole go?'
          : `Depth ${expandDepth}. You really like hitting X, huh?`,
  });

  try {
    // Import and call the expand API
    const { expandPlanRemote } = await import('../prediction/client');
    const { buildContextPayload } = await import('../prediction/contextAssembler');
    const { get } = await import('svelte/store');
    const { projectConfig } = await import('../stores/project');
    const { behaviorStore } = await import('../stores/behavior');

    const config = get(projectConfig);
    const behavior = get(behaviorStore);

    let expanded;
    if (config) {
      const context = await buildContextPayload(config, behavior);
      expanded = await expandPlanRemote(plan, context, expandDepth);
    } else {
      // No config — use mock directly
      const { expandPlanRemote: ep } = await import('../prediction/client');
      expanded = await ep(plan, {} as any, expandDepth);
    }

    // Render expansion results to terminal
    for (const step of expanded.steps) {
      const stepData = step as Record<string, unknown>;
      const n = stepData.n as number;
      const label = `STEP ${n} · DEPTH ${expandDepth}`;

      // Render whatever fields the backend returned
      if (stepData.substeps) {
        const subs = stepData.substeps as string[];
        entries.addEntry({
          type: 'thought',
          label,
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
          label: `⚠ STEP ${n} RISKS`,
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

    // Commentary
    if (expanded.commentary) {
      entries.addEntry({
        type: 'cursor',
        message: expanded.commentary,
      });
    }
  } catch (err) {
    entries.addEntry({
      type: 'cursor',
      message: `Expansion failed: ${err}. Press X to try again.`,
    });
    expandDepth--; // allow retry at same depth
  }

  status.set('idle');
  isExpanding = false;
}
```

### 4. Update X card description reactively

In the `cards` `$derived.by()` block, update the X card:

```typescript
{
  button: 'X',
  title: expandDepth === 0 ? 'Tell Me More' : `Dig Deeper (${expandDepth})`,
  description: expandDepth === 0
    ? 'Ask Claude to explain the reasoning behind each step.'
    : `Press again for depth ${expandDepth + 1}. Each press reveals more.`,
  pills: [{ label: expandDepth === 0 ? 'Clarify' : `Depth ${expandDepth}`, variant: 'neutral' as const }],
  variant: 'neutral' as const,
  onclick: () => expandPlan(),
},
```

## Backend Changes (if needed)

The `level_3_expand` template already exists in `backend/app/prompts/seed.py` (line 189). However, the `/api/v1/predict` route needs to pass `original_plan` from the request body into the template context.

Check `backend/app/routes/predict.py` around line 55 — the `template_context` dict needs:

```python
template_context = {
    "context_payload": json.dumps(payload_dict, indent=2),
    "original_plan": request_body.get("original_plan", ""),  # Add this
    # ... existing fields ...
}
```

Also in `backend/app/schemas/predict.py`, add `original_plan: str | None = None` and `depth: int | None = None` to the `PredictRequest` schema.

## Design Notes
- No scroll — terminal entries auto-scroll within the existing TerminalPanel
- Each depth layer appends NEW entries, never clears existing ones (the history is the fun part)
- The X card title and pill update reactively to show current depth
- Mock expansion works offline with 3 depth tiers, cycling after depth 3
- Debounce via `isExpanding` flag prevents double-tap spam

## Acceptance Criteria
- [ ] First X press shows substeps, files_affected, risks for each plan step
- [ ] Second X press shows alternative approaches, estimated line counts
- [ ] Third+ X press shows escalating meta-commentary and wild speculation
- [ ] X card title changes from "Tell Me More" → "Dig Deeper (N)"
- [ ] Works in mock mode (no backend needed) with 3 depth tiers
- [ ] Works with backend via `level_3_expand` call type when authenticated
- [ ] No duplicate entries — each press adds only the new depth layer
- [ ] Terminal status shows "streaming" during expansion, "idle" after
