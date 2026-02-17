import { writable, get } from 'svelte/store';
import type { Category, Suggestion, WildCard, PredictionResponse, PlanResponse, ContextPayload } from '../prediction/types';
import { predictSuggestions, generatePlan } from '../prediction/client';
import { getCached, setCached, advancePair, getCurrentPair, clearCategory } from '../prediction/cache';
import { buildContextPayload } from '../prediction/contextAssembler';
import { projectConfig, projectBehavior, globalConfig } from './configStores';
import { addSessionCost, sessionCostUsd } from './app';
import { cost } from './terminal';
import { sendFeedback } from '../prediction/feedback';
import { trackSuggestionSelected, trackPlanApproved, trackPlanRejected } from '../prediction/behaviorTracker';

// ─── Stores ──────────────────────────────────────────────────────────────────

/** Currently selected category from Level 1 */
export const selectedCategory = writable<Category | null>(null);

/** Current prediction response (raw, includes all 8 suggestions) */
export const currentPrediction = writable<PredictionResponse | null>(null);

/** The two suggestions currently displayed on A and B buttons */
export const currentPairA = writable<Suggestion | null>(null);
export const currentPairB = writable<Suggestion | null>(null);

/** The selected suggestion that the user picked (carried to Level 3) */
export const selectedSuggestion = writable<Suggestion | WildCard | null>(null);

/** The generated plan for the selected suggestion */
export const currentPlan = writable<PlanResponse | null>(null);

/** Loading state for predictions */
export const predictionsLoading = writable(false);

/** Error message if prediction fails */
export const predictionError = writable<string | null>(null);

/** Trace ID from the last prediction response (for feedback) */
export const lastTraceId = writable<string | null>(null);

/** Trace ID from the last plan response (for feedback) */
export const lastPlanTraceId = writable<string | null>(null);

/** Number of rerolls in the current L2 session */
export const rerollCount = writable(0);

/** Timestamp when Level 2 was entered (for time-to-select tracking) */
export const level2EnteredAt = writable(0);

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Build context from current project config and behavior stores.
 */
async function getContext(): Promise<ContextPayload> {
  const config = get(projectConfig);
  const behavior = get(projectBehavior);

  if (!config) {
    // Return a minimal mock context if no project is loaded
    return buildContextPayload(
      {
        schema_version: 1,
        project: { id: '', name: 'Demo', path: '.', created_at: '', created_via: 'imported', initial_pitch: '' },
        tech_stack: { type_detected: 'unknown', framework: '', build_tool: '', language: '', dependencies: [], detected_at: '' },
        run_config: { command: '', auto_detected: false, detection_source: '', working_directory: '.', env_vars: {}, port: null, window_class: '' },
        display: { split_ratio: 55 },
        input: { back_grip_overrides: {} },
        deploy: { provider: null, domain: null, project_id: null, team_id: null, branch_strategy: 'merge_to_main', target_branch: 'main', auto_detected: false, detection_source: null, configured_at: null, last_deploy: null, deploy_history_count: 0 },
        claude_code: { session_id: null, last_session_resumed_at: null, total_tasks_completed: 0, current_task_in_progress: false },
        features_detected: [],
        session_history: { total_sessions: 0, current_session_number: 0, sessions: [] },
      },
      behavior,
    );
  }

  return buildContextPayload(config, behavior);
}

/**
 * Get the cost warning threshold from global config.
 */
function getCostWarningThreshold(): number {
  const config = get(globalConfig);
  return config?.cost_tracking?.session_budget_warning_threshold_usd ?? 1.0;
}

/**
 * Load predictions for a category. Checks cache first, then calls prediction client.
 */
export async function loadPredictions(category: Category, signal?: AbortSignal): Promise<void> {
  selectedCategory.set(category);
  predictionError.set(null);
  rerollCount.set(0);
  level2EnteredAt.set(Date.now());

  const context = await getContext();

  // Check cache first
  const cached = getCached(category, context);
  if (cached) {
    if (signal?.aborted) return;
    currentPrediction.set(cached.response);
    lastTraceId.set(cached.response.trace_id ?? null);
    const [a, b] = getCurrentPair(cached);
    currentPairA.set(a);
    currentPairB.set(b);
    return;
  }

  // Cache miss — fetch from prediction client
  predictionsLoading.set(true);

  try {
    const response = await predictSuggestions(category, context, signal);

    // Guard: check if aborted before writing stores
    if (signal?.aborted) return;

    currentPrediction.set(response);

    // Capture metadata from backend response
    lastTraceId.set(response.trace_id ?? null);
    if (response.cost_usd) {
      addSessionCost(response.cost_usd, getCostWarningThreshold());
      cost.set(`$${get(sessionCostUsd).toFixed(4)}`);
    }

    // Cache the response
    const entry = setCached(category, context, response);
    const [a, b] = getCurrentPair(entry);
    currentPairA.set(a);
    currentPairB.set(b);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('Prediction failed:', error);
    predictionError.set('predictions failed — showing backup ideas');
  } finally {
    if (!signal?.aborted) predictionsLoading.set(false);
  }
}

/**
 * Reroll suggestions (RB button). Cycles through cached pairs.
 * If pairs exhausted, fetches fresh suggestions.
 */
export async function rerollSuggestions(): Promise<void> {
  const category = get(selectedCategory);
  if (!category) return;

  rerollCount.update(n => n + 1);

  const advanced = advancePair(category);

  if (advanced) {
    // Successfully moved to next cached pair
    const cached = getCached(category, await getContext());
    if (cached) {
      const [a, b] = getCurrentPair(cached);
      currentPairA.set(a);
      currentPairB.set(b);
    }
  } else {
    // Pairs exhausted — send reroll feedback then fetch fresh
    const traceId = get(lastTraceId);
    if (traceId) {
      sendFeedback({
        trace_id: traceId,
        user_action: 'rerolled',
        reroll_count: get(rerollCount),
      });
    }

    clearCategory(category);
    await loadPredictions(category);
  }
}

/**
 * Select a suggestion and generate its plan (transition to Level 3).
 */
export async function selectAndPlan(suggestion: Suggestion | WildCard, signal?: AbortSignal): Promise<void> {
  selectedSuggestion.set(suggestion);
  currentPlan.set(null);

  const category = get(selectedCategory);
  const enteredAt = get(level2EnteredAt);
  const timeToSelect = enteredAt ? Date.now() - enteredAt : 0;
  const currentRerollCount = get(rerollCount);

  // Determine which button was pressed (A, B, or X for wildcard)
  const pairA = get(currentPairA);
  const pairB = get(currentPairB);
  let button = 'X'; // wildcard
  if (pairA && suggestion.label === pairA.label) button = 'A';
  else if (pairB && suggestion.label === pairB.label) button = 'B';

  // Fire-and-forget: send selection feedback
  const traceId = get(lastTraceId);
  if (traceId && category) {
    const selectedIndex = button === 'A' ? 0 : button === 'B' ? 1 : -1;
    sendFeedback({
      trace_id: traceId,
      user_action: 'selected',
      selection_speed_ms: timeToSelect,
      selected_index: selectedIndex,
      reroll_count: currentRerollCount,
    });
  }

  // Fire-and-forget: track behavior
  if (category) {
    const prediction = get(currentPrediction);
    const optionsShown = [pairA?.label, pairB?.label].filter(Boolean) as string[];
    const wildCardShown = prediction?.wild_card?.label;
    trackSuggestionSelected(category, suggestion, button, timeToSelect, currentRerollCount, optionsShown, wildCardShown);
  }

  const context = await getContext();

  try {
    const plan = await generatePlan(suggestion as Suggestion, context, signal);

    // Guard: check if aborted before writing stores
    if (signal?.aborted) return;

    currentPlan.set(plan);
    lastPlanTraceId.set(plan.trace_id ?? null);

    // Track plan cost
    if (plan.cost_usd) {
      addSessionCost(plan.cost_usd, getCostWarningThreshold());
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('Plan generation failed:', error);
    // Generate a minimal fallback plan
    if (signal?.aborted) return;
    currentPlan.set({
      summary: suggestion.label,
      quip: suggestion.quip,
      steps: [
        { n: 1, text: 'Analyze the codebase for the best implementation approach' },
        { n: 2, text: 'Implement the core functionality' },
        { n: 3, text: 'Test and verify the implementation' },
      ],
      scope: suggestion.scope,
      confidence: 'medium',
      unhinged_modifier: 'Go wild. Add extra flair and unexpected polish.',
      claude_code_intent: `Implement: ${suggestion.label}. ${suggestion.rationale}`,
    });
  }
}

/**
 * Track plan approval (Ship It or Ship It Unhinged).
 */
export function trackPlanApproval(unhinged: boolean): void {
  const category = get(selectedCategory);
  const suggestion = get(selectedSuggestion);
  if (!category || !suggestion) return;

  const button = unhinged ? 'ship_it_unhinged' : 'ship_it';

  // Fire-and-forget: send approval feedback
  const traceId = get(lastPlanTraceId) ?? get(lastTraceId);
  if (traceId) {
    sendFeedback({
      trace_id: traceId,
      user_action: 'selected',
      plan_approved: true,
      plan_approval_button: button,
      used_unhinged_modifier: unhinged,
    });
  }

  // Fire-and-forget: track behavior
  trackPlanApproved(category, suggestion, button);
}

/**
 * Track plan rejection (Go Back from Level 3).
 */
export function trackPlanRejection(): void {
  const category = get(selectedCategory);
  const suggestion = get(selectedSuggestion);
  if (!category || !suggestion) return;

  // Fire-and-forget: send rejection feedback
  const traceId = get(lastPlanTraceId) ?? get(lastTraceId);
  if (traceId) {
    sendFeedback({
      trace_id: traceId,
      user_action: 'rejected',
      plan_approved: false,
    });
  }

  // Fire-and-forget: track behavior
  trackPlanRejected(category, suggestion);
}

/**
 * Reset prediction state (when leaving Level 2/3).
 */
export function resetPredictionState(): void {
  currentPairA.set(null);
  currentPairB.set(null);
  selectedSuggestion.set(null);
  currentPlan.set(null);
  predictionsLoading.set(false);
  predictionError.set(null);
}
