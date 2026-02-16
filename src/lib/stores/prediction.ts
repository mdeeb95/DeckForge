import { writable, get } from 'svelte/store';
import type { Category, Suggestion, WildCard, PredictionResponse, PlanResponse, ContextPayload } from '../prediction/types';
import { predictSuggestions, generatePlan } from '../prediction/client';
import { getCached, setCached, advancePair, getCurrentPair, clearCategory } from '../prediction/cache';
import { buildContextPayload } from '../prediction/contextAssembler';
import { projectConfig, projectBehavior } from './configStores';

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
 * Load predictions for a category. Checks cache first, then calls prediction client.
 */
export async function loadPredictions(category: Category): Promise<void> {
  selectedCategory.set(category);
  predictionError.set(null);

  const context = await getContext();

  // Check cache first
  const cached = getCached(category, context);
  if (cached) {
    currentPrediction.set(cached.response);
    const [a, b] = getCurrentPair(cached);
    currentPairA.set(a);
    currentPairB.set(b);
    return;
  }

  // Cache miss — fetch from prediction client
  predictionsLoading.set(true);

  try {
    const response = await predictSuggestions(category, context);
    currentPrediction.set(response);

    // Cache the response
    const entry = setCached(category, context, response);
    const [a, b] = getCurrentPair(entry);
    currentPairA.set(a);
    currentPairB.set(b);
  } catch (error) {
    console.error('Prediction failed:', error);
    predictionError.set('predictions failed — showing backup ideas');
  } finally {
    predictionsLoading.set(false);
  }
}

/**
 * Reroll suggestions (RB button). Cycles through cached pairs.
 * If pairs exhausted, fetches fresh suggestions.
 */
export async function rerollSuggestions(): Promise<void> {
  const category = get(selectedCategory);
  if (!category) return;

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
    // Pairs exhausted — fetch fresh suggestions
    clearCategory(category);
    await loadPredictions(category);
  }
}

/**
 * Select a suggestion and generate its plan (transition to Level 3).
 */
export async function selectAndPlan(suggestion: Suggestion | WildCard): Promise<void> {
  selectedSuggestion.set(suggestion);
  currentPlan.set(null);

  const context = await getContext();

  try {
    const plan = await generatePlan(suggestion as Suggestion, context);
    currentPlan.set(plan);
  } catch (error) {
    console.error('Plan generation failed:', error);
    // Generate a minimal fallback plan
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
