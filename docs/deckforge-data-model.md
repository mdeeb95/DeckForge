# DeckForge — Data Model & Schema Reference

**Single source of truth for every piece of data DeckForge stores.** Local files on the Steam Deck, PostgreSQL on Railway, and Langfuse traces. If a field exists anywhere in the system, it's defined here.

---

## WHERE DATA LIVES

```
STEAM DECK (local)                          RAILWAY (remote)
─────────────────                           ────────────────
~/.config/deckforge/                        PostgreSQL
  global.json            (app settings)       users
  behavior-global.json   (cross-project)      api_keys (encrypted)
  auth.json              (session token)      prompt_templates
                                              project_sync (metadata only)
~/projects/<name>/
  .deckforge/                               Langfuse (self-hosted)
    project.json         (project config)     traces
    behavior.json        (project behavior)   generations
    cache/               (prediction cache)   scores
    screenshots/         (captured images)    events
  .claude/
    CLAUDE.md            (auto-generated)
  ...project files...
```

**Principle:** Code and conversation history NEVER leave the device. Only anonymized metadata, prediction prompts/responses, and behavioral signals go to Railway.

---

## 1. LOCAL: Global App Settings

**File:** `~/.config/deckforge/global.json`

Created on first launch. Stores app-wide preferences that aren't tied to any project.

```json
{
  "schema_version": 1,

  "user": {
    "id": "uuid-v4",
    "created_at": "2025-02-14T18:00:00Z",
    "onboarding_completed": true
  },

  "prediction_engine": {
    "provider": "anthropic",
    "model_overrides": {
      "level_2": null,
      "level_3": null,
      "bug_detection": null,
      "exploration": null,
      "qa_analysis": null,
      "deploy_preflight": null
    },
    "temperature": 0.8,
    "backend_mode": "proxied",
    "direct_api_key_ref": null
  },

  "claude_code": {
    "permission_mode": "acceptEdits",
    "allowed_tool_patterns": [
      "Read", "Write", "Edit", "Glob", "Grep",
      "Bash(git *)", "Bash(npm *)", "Bash(npx *)",
      "Bash(python *)", "Bash(pip *)", "Bash(cargo *)",
      "Bash(make *)", "Bash(godot *)"
    ],
    "dangerous_ops_require_confirmation": true
  },

  "display": {
    "default_split_ratio": 55,
    "scanline_overlay": true,
    "theme": "default"
  },

  "input": {
    "back_grip_bindings": {
      "L4": "quick_qa",
      "L5": "undo",
      "R4": "restart_app",
      "R5": "commit_checkpoint"
    },
    "stick_scroll_speed": 1.0,
    "resize_increment_pct": 5
  },

  "telemetry": {
    "enabled": true,
    "anonymized_user_id": "sha256-of-uuid"
  },

  "cost_tracking": {
    "session_budget_warning_threshold_usd": 0.50,
    "show_cost_indicator": true
  }
}
```

**Field notes:**

- `prediction_engine.backend_mode`: `"proxied"` (calls go through Railway backend, no local API key needed) or `"direct"` (user provides their own key, calls go straight to LLM provider). Proxied is default.
- `prediction_engine.model_overrides`: Per-call-type overrides. `null` means use the default tier from the prediction engine doc (Fast for L2, Mid for L3, etc.). If set, it's a model string like `"claude-3-5-haiku"`.
- `prediction_engine.direct_api_key_ref`: Not the key itself — a reference to the system keyring entry. Keys are stored in the OS keyring (libsecret on Linux), never in plaintext JSON.
- `claude_code.allowed_tool_patterns`: Patterns for the SDK's `allowed_tools` parameter. Supports glob-style matching.
- `input.back_grip_bindings`: Values are DeckForge action IDs (see input map doc). Can also be `"shell:<command>"` or `"prompt:<saved_prompt_id>"`.

---

## 2. LOCAL: Global Behavior (Cross-Project)

**File:** `~/.config/deckforge/behavior-global.json`

Aggregated behavior across ALL projects. Used for cold-start inference on new projects and global preference tracking.

```json
{
  "schema_version": 1,
  "last_updated": "2025-02-14T20:30:00Z",

  "aggregate": {
    "total_sessions": 23,
    "total_tasks_completed": 87,
    "total_projects": 5,

    "categories_selected": {
      "Feature": 52,
      "Bug": 18,
      "TechDebt": 12,
      "Yolo": 5
    },

    "option_slot_preferences": {
      "a": 45,
      "b": 30,
      "x": 10,
      "y": 15
    },

    "avg_rerolls_before_selection": 0.8,
    "plans_approved_first_try_pct": 72,
    "plans_rejected_pct": 15,
    "plans_expanded_pct": 13,
    "avg_time_to_select_ms": 3200,
    "voice_usage_total": 2,

    "preferred_complexity": "medium",
    "preferred_project_types": ["node-web", "python-cli"]
  },

  "rejection_history": [
    {
      "label": "user authentication",
      "category": "Feature",
      "rejected_at": "2025-02-12T19:00:00Z",
      "rejected_count": 2,
      "suppressed_until_session": 7
    }
  ]
}
```

**Field notes:**

- `rejection_history`: Features the user has explicitly rejected. Suppressed for 3 sessions (per prediction engine doc Section 5.2), then allowed back with reduced priority. The `suppressed_until_session` is a global session counter.
- `preferred_complexity`: Computed from the scope of tasks the user typically approves. `"quick tweak"` heavy = `"low"`, balanced = `"medium"`, `"strap in"` heavy = `"high"`.

---

## 3. LOCAL: Auth Token

**File:** `~/.config/deckforge/auth.json`

Session token for the Railway backend. Minimal — just enough to authenticate API calls.

```json
{
  "schema_version": 1,
  "access_token": "jwt-token-here",
  "refresh_token": "refresh-token-here",
  "expires_at": "2025-02-15T18:00:00Z",
  "backend_url": "https://deckforge-api.railway.app"
}
```

---

## 4. LOCAL: Per-Project Config

**File:** `~/projects/<name>/.deckforge/project.json`

Created when a project is first opened in DeckForge. Stores everything project-specific.

```json
{
  "schema_version": 1,

  "project": {
    "id": "uuid-v4",
    "name": "my-notes-app",
    "path": "/home/deck/projects/my-notes-app",
    "created_at": "2025-02-14T18:30:00Z",
    "created_via": "voice_pitch",
    "initial_pitch": "A simple notes app with markdown support"
  },

  "tech_stack": {
    "type_detected": "node-web",
    "framework": "React 18",
    "build_tool": "Vite",
    "language": "JavaScript",
    "dependencies": ["react-markdown", "zustand"],
    "detected_at": "2025-02-14T18:31:00Z"
  },

  "run_config": {
    "command": "npm run dev",
    "auto_detected": true,
    "detection_source": "package.json scripts.dev",
    "working_directory": ".",
    "env_vars": {},
    "port": 5173,
    "window_class": "chromium"
  },

  "display": {
    "split_ratio": 55
  },

  "input": {
    "back_grip_overrides": {}
  },

  "deploy": {
    "provider": "vercel",
    "domain": "neo-dashboard.vercel.app",
    "project_id": "prj_abc123",
    "team_id": null,
    "branch_strategy": "merge_to_main",
    "target_branch": "main",
    "auto_detected": true,
    "detection_source": "vercel.json",
    "configured_at": "2025-02-14T18:35:00Z",
    "last_deploy": {
      "status": "healthy",
      "url": "https://neo-dashboard.vercel.app",
      "preview_url": null,
      "deployed_at": "2025-02-14T19:45:00Z",
      "commit_sha": "abc1234",
      "duration_seconds": 38
    },
    "deploy_history_count": 7
  },

  "claude_code": {
    "session_id": "cc-session-uuid",
    "last_session_resumed_at": "2025-02-14T20:00:00Z",
    "total_tasks_completed": 12,
    "current_task_in_progress": false
  },

  "features_detected": [
    {
      "summary": "Add note creation and listing",
      "commit_sha": "abc1234",
      "detected_at": "2025-02-14T18:45:00Z",
      "session_number": 1
    },
    {
      "summary": "Add note editing with markdown support",
      "commit_sha": "def5678",
      "detected_at": "2025-02-14T19:10:00Z",
      "session_number": 1
    },
    {
      "summary": "Add search and filtering to notes app",
      "commit_sha": "ghi9012",
      "detected_at": "2025-02-14T20:05:00Z",
      "session_number": 2
    }
  ],

  "session_history": {
    "total_sessions": 4,
    "current_session_number": 4,
    "sessions": [
      {
        "session_number": 1,
        "started_at": "2025-02-14T18:30:00Z",
        "ended_at": "2025-02-14T19:45:00Z",
        "tasks_completed": 3,
        "prediction_cost_usd": 0.052
      }
    ]
  }
}
```

**Field notes:**

- `created_via`: How the project was created. One of: `"voice_pitch"`, `"exploration_mode"`, `"empty_state_starter"`, `"template"`, `"imported"` (existing repo opened in DeckForge).
- `run_config.window_class`: Used by wlrctl/wmctrl for window switching (RT/LT). DeckForge detects this on first app launch and saves it.
- `run_config.auto_detected`: Whether the run command was auto-detected or manually configured by the user.
- `deploy.provider`: One of: `"vercel"`, `"railway"`, `"netlify"`, `"github_pages"`, `null` (not configured). Auto-detected from config files (`vercel.json`, `railway.toml`, `netlify.toml`) or manually set on first deploy.
- `deploy.branch_strategy`: `"merge_to_main"` (merge feature branch into target, then push), `"direct_push"` (push current branch, auto-deploy picks it up), or `"pr"` (push branch, open a PR — used by Push Only).
- `deploy.auto_detected`: Whether the deploy config was found from an existing config file or manually configured by the user.
- `deploy.last_deploy`: Snapshot of the most recent deployment. `preview_url` is set when the last deploy was a preview (non-production).
- `deploy.deploy_history_count`: Total deploys from DeckForge. Detailed history is in git tags (`[DeckForge-deploy]` tag pattern) and optionally synced to the backend.
- `display.split_ratio`: Per-project override. If not set, falls back to global `default_split_ratio`.
- `input.back_grip_overrides`: Per-project keybind overrides. Empty object = use global defaults. Keys are grip IDs (`"L4"`, etc.), values are action IDs.
- `features_detected`: Built from `[DeckForge]`-tagged git commits (prediction engine doc Section 2.2.1). Each entry is one completed task. This is the source of truth for the `detected_features` array in the context payload.
- `claude_code.session_id`: The SDK session ID for resume/persistence. Saved so DeckForge can resume where Claude Code left off.

---

## 5. LOCAL: Per-Project Behavior

**File:** `~/projects/<name>/.deckforge/behavior.json`

Per-project behavioral data. Fed into the prediction engine's context payload as `user_behavior`. Also rolled up into the global behavior file.

```json
{
  "schema_version": 1,
  "last_updated": "2025-02-14T20:30:00Z",

  "aggregate": {
    "categories_selected": {
      "Feature": 8,
      "Bug": 3,
      "TechDebt": 1,
      "Yolo": 0
    },

    "option_slot_preferences": {
      "a": 5,
      "b": 4,
      "x": 1,
      "y": 2
    },

    "avg_rerolls_before_selection": 1.2,
    "plans_approved_first_try_pct": 75,
    "plans_rejected_pct": 15,
    "plans_expanded_pct": 10,
    "avg_time_to_select_ms": 2800,
    "voice_usage_count": 0,

    "preferred_complexity": "medium",
    "last_category": "Feature"
  },

  "rejection_history": [
    {
      "label": "dark mode",
      "category": "Feature",
      "rejected_at": "2025-02-14T19:00:00Z",
      "rejected_count": 1,
      "suppressed_until_session": 5
    }
  ],

  "approval_history": [
    {
      "label": "Add search & filter",
      "category": "Feature",
      "approved_at": "2025-02-14T20:00:00Z",
      "plan_button": "a_ship_it",
      "task_completed": true,
      "rolled_back": false
    }
  ],

  "session_events": [
    {
      "timestamp": "2025-02-14T20:00:00Z",
      "screen": "level_2_feature",
      "options_shown": ["Add search", "Add tags"],
      "wild_card_shown": "Mood ring notes",
      "selected": "a",
      "time_to_select_ms": 2300,
      "reroll_count": 0
    },
    {
      "timestamp": "2025-02-14T20:00:03Z",
      "screen": "level_3_plan",
      "plan_summary": "Add search and filtering",
      "selected": "a_ship_it",
      "time_to_select_ms": 4100,
      "expanded": false,
      "unhinged": false
    }
  ]
}
```

**Field notes:**

- `session_events`: Raw event log for the current session. Cleared on session end, but aggregated into `aggregate` first. Also sent to Langfuse as trace events (if telemetry enabled).
- `approval_history`: Tracks what the user has actually built. Used by the prediction engine to avoid suggesting things that already exist.
- `rejection_history.suppressed_until_session`: Per-project session number. After this session, the rejected feature is allowed back (with reduced priority via a prompt addendum).

---

## 6. LOCAL: Prediction Cache

**Directory:** `~/projects/<name>/.deckforge/cache/`

Cached prediction responses. Each category has its own cache file with its own invalidation hash.

```
cache/
  feature_suggestions.json
  bug_suggestions.json
  tech_debt_suggestions.json
  exploration_ideas.json       (global, not per-project)
  empty_state_starters.json    (global, not per-project)
```

**Cache file structure (e.g., `feature_suggestions.json`):**

```json
{
  "schema_version": 1,
  "category": "feature",
  "invalidation_hash": "sha256-of-features-hash",
  "cached_at": "2025-02-14T20:00:00Z",
  "ttl_seconds": null,

  "response": {
    "header_quip": "pick a feature, any feature",
    "suggestions": [ "...full 8-item array..." ],
    "modifier": { "..." },
    "wild_card": { "..." }
  },

  "display_state": {
    "current_pair_index": 0,
    "pairs_exhausted": false,
    "previously_shown_labels": ["Add search & filter", "Add tags & categories"]
  }
}
```

**Field notes:**

- `invalidation_hash`: Per-category hash as defined in prediction engine doc Section 7.1. For features: `hash(detected_features + file_tree_structure + rejected_features_list)`.
- `ttl_seconds`: `null` for project-specific caches (hash-based invalidation only). Set for global caches: exploration ideas = 604800 (1 week), empty state starters = 604800.
- `display_state.current_pair_index`: Which pair of suggestions is currently showing. 0 = first pair (A/B shows `[0]` and `[1]`), 1 = second pair (`[2]` and `[3]`), etc. Incremented on RB reroll.
- `display_state.previously_shown_labels`: Accumulated across rerolls. Sent to the API on fresh calls to prevent repeats.

---

## 7. LOCAL: Screenshots

**Directory:** `~/projects/<name>/.deckforge/screenshots/`

Captured via RB (Phase 1). Stored as PNGs with metadata sidecar.

```
screenshots/
  2025-02-14T20-15-00.png
  2025-02-14T20-15-00.meta.json
```

**Metadata sidecar:**

```json
{
  "captured_at": "2025-02-14T20:15:00Z",
  "session_number": 4,
  "source_window": "chromium",
  "sent_to_claude_code": true,
  "voice_annotation": null,
  "triggered_task": false
}
```

---

## 8. LOCAL: Auto-Generated CLAUDE.md

**File:** `~/projects/<name>/.claude/CLAUDE.md`

Auto-generated by DeckForge on project creation and updated as the project evolves. Read by Claude Code via `setting_sources: ["project"]`.

```markdown
# Project: my-notes-app

## Build & Run
- Dev server: `npm run dev`
- Build: `npm run build`
- Test: `npm test`

## Tech Stack
- React 18 + Vite
- JavaScript
- Dependencies: react-markdown, zustand

## Conventions
- Components in src/components/
- Styles colocated with components
- State management via Zustand store

## DeckForge Context
This project is managed via DeckForge (gamepad interface).
The user strongly prefers not to type — handle everything yourself.
Provide clear progress updates.
Auto-commit after completing each task with a descriptive message.
```

**Field notes:**

- This file is regenerated (not appended) when tech stack detection changes or when the user manually updates run config. Claude Code reads it fresh each session.
- The "Conventions" section is initially sparse and grows as DeckForge observes patterns in Claude Code's work (e.g., if Claude Code consistently creates components in a specific directory).

---

## 9. REMOTE: PostgreSQL Schema (Railway)

The backend database. Langfuse manages its own tables internally — these are the DeckForge-specific tables.

### 9.1 `users`

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymized_id   TEXT UNIQUE NOT NULL,    -- sha256 of local uuid, for Langfuse correlation
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    app_version     TEXT,
    plan_tier       TEXT NOT NULL DEFAULT 'free'  -- 'free' | 'pro' (future)
);
```

### 9.2 `auth_tokens`

```sql
CREATE TABLE auth_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,           -- bcrypt hash of JWT
    refresh_hash    TEXT NOT NULL,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);
```

### 9.3 `api_keys` (for proxied mode)

```sql
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,           -- 'anthropic' | 'openai' | 'google'
    encrypted_key   TEXT NOT NULL,           -- AES-256-GCM encrypted
    key_prefix      TEXT NOT NULL,           -- first 8 chars for identification ('sk-ant-a...')
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ,
    is_valid        BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
```

**Note:** Only needed if the user opts into storing their API key on the server (for proxied mode without DeckForge-provided keys). If DeckForge provides API access as a service, this table stores the service's keys instead.

### 9.4 `prompt_templates`

Server-side prompt templates. The killer feature: update prompts without shipping app updates. A/B testable.

```sql
CREATE TABLE prompt_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,           -- 'level_2_feature', 'level_3_plan', etc.
    version         INTEGER NOT NULL DEFAULT 1,
    template_text   TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    ab_test_group   TEXT,                    -- null = default, 'A' or 'B' for A/B tests
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(name, version, ab_test_group)
);

CREATE INDEX idx_prompt_templates_active ON prompt_templates(name, is_active);
```

**Prompt template names** (one row per active version):

| `name` | Description |
|--------|-------------|
| `level_2_feature` | Feature suggestion generation |
| `level_2_bug` | Bug detection |
| `level_2_tech_debt` | Tech debt suggestions |
| `level_3_plan` | Plan generation |
| `level_3_expand` | Plan expansion |
| `exploration` | Project idea generation |
| `qa_analysis` | QA test plan generation |
| `empty_state` | New user starter suggestions |
| `deploy_preflight` | Pre-flight check generation and deploy summary |
| `modifier_addendum` | Modifier reroll addendum |

### 9.5 `project_sync` (anonymized metadata)

Minimal project metadata synced to the backend for aggregate analytics. No code, no file contents, no project names.

```sql
CREATE TABLE project_sync (
    id                  UUID PRIMARY KEY,    -- matches local project.id
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type_detected       TEXT,                -- 'node-web', 'python-cli', 'godot', etc.
    created_at          TIMESTAMPTZ NOT NULL,
    total_sessions      INTEGER NOT NULL DEFAULT 0,
    total_tasks         INTEGER NOT NULL DEFAULT 0,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_sync_user ON project_sync(user_id);
```

### 9.6 `prediction_calls`

Every prediction API call, logged for cost tracking and debugging. Langfuse stores the detailed traces — this is the lightweight summary for billing and rate limiting.

```sql
CREATE TABLE prediction_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    trace_id        TEXT,                    -- Langfuse trace ID for correlation
    call_type       TEXT NOT NULL,           -- 'level_2_feature', 'level_3_plan', etc.
    model_used      TEXT NOT NULL,           -- 'claude-3-5-haiku', 'gemini-flash', etc.
    input_tokens    INTEGER NOT NULL,
    output_tokens   INTEGER NOT NULL,
    cost_usd        NUMERIC(10, 6) NOT NULL,
    latency_ms      INTEGER NOT NULL,
    cache_hit       BOOLEAN NOT NULL DEFAULT false,
    ab_test_group   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prediction_calls_user ON prediction_calls(user_id, created_at);
CREATE INDEX idx_prediction_calls_type ON prediction_calls(call_type, created_at);
```

### 9.7 `circuit_breaker_state`

Per-user circuit breaker state (server-side, since calls are proxied).

```sql
CREATE TABLE circuit_breaker_state (
    user_id             UUID PRIMARY KEY REFERENCES users(id),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_failure_at     TIMESTAMPTZ,
    degraded_until      TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 10. REMOTE: Langfuse Data (Managed by Langfuse)

Langfuse manages its own PostgreSQL tables internally. DeckForge interacts via the Langfuse SDK. Here's what we store as Langfuse concepts:

### 10.1 Traces

One trace per prediction call. Contains:

| Field | Value |
|-------|-------|
| `name` | `"prediction_call"` |
| `user_id` | Anonymized user ID |
| `session_id` | DeckForge session ID (groups all calls in one sitting) |
| `metadata.project_type` | `"node-web"`, `"python-cli"`, etc. (NOT project name) |
| `metadata.session_number` | Which session of this project |
| `metadata.screen` | `"level_2_feature"`, `"level_3_plan"`, etc. |

### 10.2 Generations (nested under Traces)

The actual LLM call:

| Field | Value |
|-------|-------|
| `name` | `"feature_suggestions"`, `"plan_generation"`, etc. |
| `model` | `"claude-3-5-haiku"`, `"gemini-2.0-flash"`, etc. |
| `input` | Full prompt text |
| `output` | Full JSON response |
| `usage` | Input/output/total token counts |
| `metadata.call_type` | Same as trace screen |
| `metadata.context_hash` | For cache invalidation tracking |
| `metadata.prefetched` | Whether this was a prefetch or user-triggered |
| `metadata.cache_hit` | Whether the response came from cache |
| `metadata.latency_ms` | End-to-end call time |

### 10.3 Scores (nested under Traces)

Reward signals for RLHF:

| Score Name | Type | Range | Description |
|-----------|------|-------|-------------|
| `user_selection` | NUMERIC | 0.0 or 1.0 | Did the user pick a suggestion from this call? |
| `computed_reward` | NUMERIC | -0.4 to 1.0 | Composite reward (see prediction engine doc Section 9.3) |
| `selection_speed` | NUMERIC | 0-30000 | Milliseconds to select (lower = better match) |

### 10.4 Events (nested under Traces)

Detailed user action metadata:

```json
{
  "name": "user_action",
  "metadata": {
    "button_pressed": "A",
    "suggestion_selected": "Add search & filter",
    "suggestion_index": 0,
    "time_to_select_ms": 2300,
    "reroll_count_before_selection": 0,
    "total_options_seen": 2,
    "plan_approved": true,
    "plan_approval_button": "A_ship_it",
    "used_unhinged_modifier": false
  }
}
```

---

## 11. CONTEXT PAYLOAD (assembled from local data, sent to prediction engine)

This isn't stored — it's assembled on-the-fly by the Context Assembler from the local files above. Documented here for completeness as the schema that the prediction engine actually receives.

**Source mapping:**

| Context Payload Field | Assembled From |
|----------------------|----------------|
| `project.name` | `project.json → project.name` |
| `project.type_detected` | `project.json → tech_stack.type_detected` |
| `project.created_at` | `project.json → project.created_at` |
| `project.session_number` | `project.json → session_history.current_session_number` |
| `project.total_ai_tasks_completed` | `project.json → claude_code.total_tasks_completed` |
| `file_tree.*` | Live filesystem scan (`find` + `wc -l`) |
| `git_history.*` | Live git commands (`git log`, `git status`) |
| `detected_features` | `project.json → features_detected[].summary` (deduplicated) |
| `detected_gaps` | Rule-based heuristics against file tree + tech stack |
| `current_errors` | Last cached build output |
| `tech_stack.*` | `project.json → tech_stack` |
| `user_behavior.*` | `behavior.json → aggregate` |

**Token budget:** Serialized payload must stay under 2,000 tokens. Truncation priority defined in prediction engine doc Section 2.4.

---

## 12. SCHEMA VERSIONING & MIGRATION

Every local JSON file includes a `schema_version` field. DeckForge checks this on load:

- If `schema_version` matches current app version → load normally
- If `schema_version` is older → run migration function, update file, bump version
- If `schema_version` is newer (downgrade) → load in read-only mode, warn user

PostgreSQL migrations use standard numbered migration files (`001_create_users.sql`, `002_add_prompt_templates.sql`, etc.) managed by Alembic (Python) in the FastAPI backend.

---

## 13. DATA FLOW DIAGRAM

```
USER PRESSES A (Feature) AT LEVEL 1
    │
    ▼
Context Assembler reads:
    ├── .deckforge/project.json     → project metadata, tech stack, features
    ├── .deckforge/behavior.json    → user behavior aggregate
    ├── filesystem                  → file tree (live scan)
    └── git                         → recent commits, status (live)
    │
    ▼
Assembles context_payload JSON (<2000 tokens)
    │
    ▼
Checks .deckforge/cache/feature_suggestions.json
    ├── Cache HIT (hash matches) → render cached suggestions
    └── Cache MISS →
            │
            ▼
        Tauri app → HTTPS → FastAPI backend (Railway)
            │
            ├── Backend loads prompt_templates (level_2_feature, active version)
            ├── Backend merges context_payload into template
            ├── Backend calls LLM API (Anthropic/OpenAI/Gemini)
            ├── Backend logs trace to Langfuse
            ├── Backend logs call to prediction_calls table
            └── Backend returns response JSON
            │
            ▼
        Tauri app validates response (Section 4.1 rules)
            ├── Valid → cache locally, render on screen
            └── Invalid → retry once → fallback chain
            │
            ▼
USER SELECTS A SUGGESTION
    │
    ├── Update .deckforge/behavior.json (session_events, aggregate)
    ├── Tauri app → HTTPS → FastAPI → Langfuse (score + event)
    └── Proceed to Level 3 (plan generation)
```
