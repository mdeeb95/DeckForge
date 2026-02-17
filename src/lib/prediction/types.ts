// ─── Prediction Engine Types ─────────────────────────────────────────────────
// Source of truth: docs/deckforge-prediction-engine.md

export type Category = 'feature' | 'bug' | 'tech_debt' | 'yolo';
export type ScopeLevel = 'quick tweak' | 'decent chunk' | 'strap in';

// ─── Context Payload (sent to prediction engine) ─────────────────────────────

export interface ContextPayload {
  project: {
    name: string;
    type_detected: string;
    created_at: string;
    session_number: number;
    total_ai_tasks_completed: number;
  };

  file_tree: {
    summary: string;
    top_level: string[];
    largest_files: { path: string; lines: number }[];
    recently_modified: { path: string; modified: string }[];
  };

  git_history: {
    recent_commits: { message: string; files_changed: number }[];
    current_branch: string;
    uncommitted_changes: boolean;
    total_deckforge_commits: number;
  };

  detected_features: string[];
  detected_gaps: string[];
  current_errors: string[];

  tech_stack: {
    framework: string;
    build_tool: string;
    language: string;
    dependencies: string[];
  };

  user_behavior: {
    categories_selected: Record<string, number>;
    rerolls_per_session_avg: number;
    plans_rejected_pct: number;
    last_category: string | null;
    preferred_complexity: string;
    voice_usage_count: number;
  };
}

// ─── Suggestion (Level 2) ────────────────────────────────────────────────────

export interface Suggestion {
  label: string;
  quip: string;
  scope: ScopeLevel;
  rationale: string;
  // Bug-specific
  symptom?: string;
  // Tech debt-specific
  evidence?: string;
}

export interface Modifier {
  lens: string;
  quip: string;
}

export interface WildCard {
  label: string;
  quip: string;
  scope: ScopeLevel;
  rationale: string;
  symptom?: string;
}

export interface PredictionResponse {
  header_quip: string;
  suggestions: Suggestion[];  // exactly 8
  modifier: Modifier;
  wild_card: WildCard;
  // Backend metadata (optional — absent in mock mode)
  trace_id?: string;
  model_used?: string;
  latency_ms?: number;
  cache_hit?: boolean;
  cost_usd?: number;
}

// ─── Plan (Level 3) ─────────────────────────────────────────────────────────

export interface PlanStep {
  n: number;
  text: string;
}

export interface PlanResponse {
  summary: string;
  quip: string;
  steps: PlanStep[];
  scope: ScopeLevel;
  confidence: string;
  unhinged_modifier: string;
  claude_code_intent: string;
  // Backend metadata (optional — absent in mock mode)
  trace_id?: string;
  model_used?: string;
  latency_ms?: number;
  cost_usd?: number;
}

// ─── Expanded Plan (Tell Me More) ────────────────────────────────────────────

export interface ExpandedPlanResponse {
  depth: number;
  steps: Record<string, unknown>[];
  commentary: string;
}

// ─── Cache Entry ─────────────────────────────────────────────────────────────

export interface CacheDisplayState {
  current_pair_index: number;
  pairs_exhausted: boolean;
  previously_shown_labels: string[];
}

export interface CacheEntry {
  category: Category;
  invalidation_hash: string;
  cached_at: string;
  response: PredictionResponse;
  display_state: CacheDisplayState;
}
