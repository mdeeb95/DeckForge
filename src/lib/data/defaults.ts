import type { GlobalConfig, GlobalBehavior, ProjectConfig, ProjectBehavior } from '../types/data';
import { CURRENT_SCHEMA_VERSION } from '../types/data';

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createDefaultGlobalConfig(): Promise<GlobalConfig> {
  const userId = crypto.randomUUID();
  const anonymizedId = await sha256(userId);

  return {
    schema_version: CURRENT_SCHEMA_VERSION,

    user: {
      id: userId,
      created_at: new Date().toISOString(),
      onboarding_completed: false,
    },

    prediction_engine: {
      provider: 'anthropic',
      model_overrides: {
        level_2: null,
        level_3: null,
        bug_detection: null,
        exploration: null,
        qa_analysis: null,
        deploy_preflight: null,
      },
      temperature: 0.8,
      backend_mode: 'proxied',
      direct_api_key_ref: null,
    },

    claude_code: {
      permission_mode: 'acceptEdits',
      allowed_tool_patterns: [
        'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'Bash(git *)', 'Bash(npm *)', 'Bash(npx *)',
        'Bash(python *)', 'Bash(pip *)', 'Bash(cargo *)',
        'Bash(make *)', 'Bash(godot *)',
      ],
      dangerous_ops_require_confirmation: true,
    },

    display: {
      default_split_ratio: 55,
      scanline_overlay: true,
      theme: 'default',
    },

    input: {
      back_grip_bindings: {
        L4: 'quick_qa',
        L5: 'undo',
        R4: 'restart_app',
        R5: 'commit_checkpoint',
      },
      stick_scroll_speed: 1.0,
      resize_increment_pct: 5,
    },

    telemetry: {
      enabled: true,
      anonymized_user_id: anonymizedId,
    },

    cost_tracking: {
      session_budget_warning_threshold_usd: 0.50,
      show_cost_indicator: true,
    },
  };
}

export function createDefaultGlobalBehavior(): GlobalBehavior {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    last_updated: new Date().toISOString(),

    aggregate: {
      total_sessions: 0,
      total_tasks_completed: 0,
      total_projects: 0,
      categories_selected: {
        Feature: 0,
        Bug: 0,
        TechDebt: 0,
        Yolo: 0,
      },
      option_slot_preferences: {
        a: 0,
        b: 0,
        x: 0,
        y: 0,
      },
      avg_rerolls_before_selection: 0,
      plans_approved_first_try_pct: 0,
      plans_rejected_pct: 0,
      plans_expanded_pct: 0,
      avg_time_to_select_ms: 0,
      voice_usage_total: 0,
      preferred_complexity: 'medium',
      preferred_project_types: [],
    },

    rejection_history: [],
  };
}

export function createDefaultProjectConfig(
  projectPath: string,
  projectName: string,
  createdVia: ProjectConfig['project']['created_via'] = 'imported',
  initialPitch: string = '',
): ProjectConfig {
  const now = new Date().toISOString();

  return {
    schema_version: CURRENT_SCHEMA_VERSION,

    project: {
      id: crypto.randomUUID(),
      name: projectName,
      path: projectPath,
      created_at: now,
      created_via: createdVia,
      initial_pitch: initialPitch,
    },

    tech_stack: {
      type_detected: 'unknown',
      framework: '',
      build_tool: '',
      language: '',
      dependencies: [],
      detected_at: now,
    },

    run_config: {
      command: '',
      auto_detected: false,
      detection_source: '',
      working_directory: '.',
      env_vars: {},
      port: null,
      window_class: '',
    },

    display: {
      split_ratio: 55,
    },

    input: {
      back_grip_overrides: {},
    },

    deploy: {
      provider: null,
      domain: null,
      project_id: null,
      team_id: null,
      branch_strategy: 'merge_to_main',
      target_branch: 'main',
      auto_detected: false,
      detection_source: null,
      configured_at: null,
      last_deploy: null,
      deploy_history_count: 0,
    },

    claude_code: {
      session_id: null,
      last_session_resumed_at: null,
      total_tasks_completed: 0,
      current_task_in_progress: false,
    },

    features_detected: [],

    session_history: {
      total_sessions: 0,
      current_session_number: 0,
      sessions: [],
    },
  };
}

export function createDefaultProjectBehavior(): ProjectBehavior {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    last_updated: new Date().toISOString(),

    aggregate: {
      categories_selected: {
        Feature: 0,
        Bug: 0,
        TechDebt: 0,
        Yolo: 0,
      },
      option_slot_preferences: {
        a: 0,
        b: 0,
        x: 0,
        y: 0,
      },
      avg_rerolls_before_selection: 0,
      plans_approved_first_try_pct: 0,
      plans_rejected_pct: 0,
      plans_expanded_pct: 0,
      avg_time_to_select_ms: 0,
      voice_usage_count: 0,
      preferred_complexity: 'medium',
      last_category: null,
    },

    rejection_history: [],
    approval_history: [],
    session_events: [],
  };
}
