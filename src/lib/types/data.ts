// ─── DeckForge Data Model Types ──────────────────────────────────────────────
// Source of truth: docs/deckforge-data-model.md
// Every interface maps 1:1 to the JSON schema in that doc.

export const CURRENT_SCHEMA_VERSION = 1;

// ─── Section 1: Global App Settings ─────────────────────────────────────────
// File: ~/.config/deckforge/global.json

export interface GlobalConfig {
  schema_version: number;

  user: {
    id: string;
    created_at: string;
    onboarding_completed: boolean;
  };

  prediction_engine: {
    provider: string;
    model_overrides: {
      level_2: string | null;
      level_3: string | null;
      bug_detection: string | null;
      exploration: string | null;
      qa_analysis: string | null;
      deploy_preflight: string | null;
    };
    temperature: number;
    backend_mode: 'proxied' | 'direct';
    direct_api_key_ref: string | null;
  };

  claude_code: {
    permission_mode: string;
    allowed_tool_patterns: string[];
    dangerous_ops_require_confirmation: boolean;
  };

  display: {
    default_split_ratio: number;
    scanline_overlay: boolean;
    theme: string;
  };

  input: {
    back_grip_bindings: Record<string, string>;
    stick_scroll_speed: number;
    resize_increment_pct: number;
  };

  telemetry: {
    enabled: boolean;
    anonymized_user_id: string;
  };

  cost_tracking: {
    session_budget_warning_threshold_usd: number;
    show_cost_indicator: boolean;
  };

  recent_projects: RecentProject[];
}

export interface RecentProject {
  path: string;
  name: string;
  last_opened: string;
  tech_stack: string;
  framework: string;
}

// ─── Section 2: Global Behavior (Cross-Project) ────────────────────────────
// File: ~/.config/deckforge/behavior-global.json

export interface GlobalBehavior {
  schema_version: number;
  last_updated: string;

  aggregate: {
    total_sessions: number;
    total_tasks_completed: number;
    total_projects: number;
    categories_selected: Record<string, number>;
    option_slot_preferences: Record<string, number>;
    avg_rerolls_before_selection: number;
    plans_approved_first_try_pct: number;
    plans_rejected_pct: number;
    plans_expanded_pct: number;
    avg_time_to_select_ms: number;
    voice_usage_total: number;
    preferred_complexity: 'low' | 'medium' | 'high';
    preferred_project_types: string[];
  };

  rejection_history: GlobalRejectionEntry[];
}

export interface GlobalRejectionEntry {
  label: string;
  category: string;
  rejected_at: string;
  rejected_count: number;
  suppressed_until_session: number;
}

// ─── Section 3: Auth Token ──────────────────────────────────────────────────
// File: ~/.config/deckforge/auth.json

export interface AuthToken {
  schema_version: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  backend_url: string;
  // Google identity
  email: string;
  display_name: string;
  avatar_url?: string;
  is_admin: boolean;
}

// ─── Section 4: Per-Project Config ──────────────────────────────────────────
// File: <project>/.deckforge/project.json

export type ProjectCreatedVia =
  | 'voice_pitch'
  | 'exploration_mode'
  | 'empty_state_starter'
  | 'template'
  | 'imported';

export type DeployProvider =
  | 'vercel'
  | 'railway'
  | 'netlify'
  | 'github_pages'
  | null;

export type BranchStrategy = 'merge_to_main' | 'direct_push' | 'pr';

export interface ProjectConfig {
  schema_version: number;

  project: {
    id: string;
    name: string;
    path: string;
    created_at: string;
    created_via: ProjectCreatedVia;
    initial_pitch: string;
  };

  tech_stack: {
    type_detected: string;
    framework: string;
    build_tool: string;
    language: string;
    dependencies: string[];
    detected_at: string;
  };

  run_config: {
    command: string;
    auto_detected: boolean;
    detection_source: string;
    working_directory: string;
    env_vars: Record<string, string>;
    port: number | null;
    window_class: string;
  };

  display: {
    split_ratio: number;
  };

  input: {
    back_grip_overrides: Record<string, string>;
  };

  deploy: {
    provider: DeployProvider;
    domain: string | null;
    project_id: string | null;
    team_id: string | null;
    branch_strategy: BranchStrategy;
    target_branch: string;
    auto_detected: boolean;
    detection_source: string | null;
    configured_at: string | null;
    last_deploy: LastDeploy | null;
    deploy_history_count: number;
  };

  claude_code: {
    session_id: string | null;
    last_session_resumed_at: string | null;
    total_tasks_completed: number;
    current_task_in_progress: boolean;
  };

  features_detected: DetectedFeature[];

  session_history: {
    total_sessions: number;
    current_session_number: number;
    sessions: SessionRecord[];
  };
}

export interface LastDeploy {
  status: string;
  url: string;
  preview_url: string | null;
  deployed_at: string;
  commit_sha: string;
  duration_seconds: number;
}

export interface DetectedFeature {
  summary: string;
  commit_sha: string;
  detected_at: string;
  session_number: number;
}

export interface SessionRecord {
  session_number: number;
  started_at: string;
  ended_at: string | null;
  tasks_completed: number;
  prediction_cost_usd: number;
}

// ─── Section 5: Per-Project Behavior ────────────────────────────────────────
// File: <project>/.deckforge/behavior.json

export interface ProjectBehavior {
  schema_version: number;
  last_updated: string;

  aggregate: {
    categories_selected: Record<string, number>;
    option_slot_preferences: Record<string, number>;
    avg_rerolls_before_selection: number;
    plans_approved_first_try_pct: number;
    plans_rejected_pct: number;
    plans_expanded_pct: number;
    avg_time_to_select_ms: number;
    voice_usage_count: number;
    preferred_complexity: 'low' | 'medium' | 'high';
    last_category: string | null;
  };

  rejection_history: ProjectRejectionEntry[];
  approval_history: ApprovalEntry[];
  session_events: SessionEvent[];
}

export interface ProjectRejectionEntry {
  label: string;
  category: string;
  rejected_at: string;
  rejected_count: number;
  suppressed_until_session: number;
}

export interface ApprovalEntry {
  label: string;
  category: string;
  approved_at: string;
  plan_button: string;
  task_completed: boolean;
  rolled_back: boolean;
}

export interface SessionEvent {
  timestamp: string;
  screen: string;
  selected: string;
  time_to_select_ms: number;
  // Level 2 fields
  options_shown?: string[];
  wild_card_shown?: string;
  reroll_count?: number;
  // Level 3 fields
  plan_summary?: string;
  expanded?: boolean;
  unhinged?: boolean;
}

// ─── Section 6: Prediction Cache ────────────────────────────────────────────
// Directory: <project>/.deckforge/cache/

export interface PredictionCache {
  schema_version: number;
  category: string;
  invalidation_hash: string;
  cached_at: string;
  ttl_seconds: number | null;

  response: {
    header_quip: string;
    suggestions: unknown[];
    modifier: unknown;
    wild_card: unknown;
  };

  display_state: {
    current_pair_index: number;
    pairs_exhausted: boolean;
    previously_shown_labels: string[];
  };
}

// ─── Section 7: Screenshot Metadata ─────────────────────────────────────────
// Directory: <project>/.deckforge/screenshots/

export interface ScreenshotMeta {
  captured_at: string;
  session_number: number;
  source_window: string;
  sent_to_claude_code: boolean;
  voice_annotation: string | null;
  triggered_task: boolean;
}
