/**
 * Config and defaults tests — verifies loadGlobalConfig fallback,
 * createDefaultGlobalConfig structure, createDefaultProjectConfig deploy section,
 * and schema_version consistency.
 */
import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '$lib/types/data';
import {
  createDefaultGlobalConfig,
  createDefaultGlobalBehavior,
  createDefaultProjectConfig,
  createDefaultProjectBehavior,
} from '$lib/data/defaults';
import { loadGlobalConfig } from '$lib/data/config';

describe('loadGlobalConfig()', () => {
  it('returns valid defaults when no file exists', async () => {
    const config = await loadGlobalConfig();
    expect(config).toBeDefined();
    expect(config.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(config.user).toBeDefined();
    expect(config.prediction_engine).toBeDefined();
    expect(config.claude_code).toBeDefined();
    expect(config.display).toBeDefined();
    expect(config.input).toBeDefined();
    expect(config.telemetry).toBeDefined();
    expect(config.cost_tracking).toBeDefined();
  });
});

describe('createDefaultGlobalConfig()', () => {
  it('has all required fields', async () => {
    const config = await createDefaultGlobalConfig();
    expect(config.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(config.user.id).toBeTruthy();
    expect(config.prediction_engine.provider).toBe('anthropic');
    expect(config.claude_code.permission_mode).toBe('acceptEdits');
    expect(config.display.default_split_ratio).toBeGreaterThan(0);
    expect(config.input.back_grip_bindings).toBeDefined();
    expect(config.telemetry.anonymized_user_id).toBeTruthy();
    expect(config.cost_tracking.session_budget_warning_threshold_usd).toBeGreaterThan(0);
  });
});

describe('createDefaultProjectConfig()', () => {
  it('has deploy section', () => {
    const config = createDefaultProjectConfig('/test/path', 'test-project');
    expect(config.deploy).toBeDefined();
    expect(config.deploy.branch_strategy).toBe('merge_to_main');
    expect(config.deploy.target_branch).toBe('main');
    expect(config.deploy.provider).toBeNull();
  });

  it('sets project name and path', () => {
    const config = createDefaultProjectConfig('/my/project', 'my-app');
    expect(config.project.name).toBe('my-app');
    expect(config.project.path).toBe('/my/project');
  });
});

describe('schema_version', () => {
  it('matches CURRENT_SCHEMA_VERSION across all defaults', async () => {
    const globalConfig = await createDefaultGlobalConfig();
    const globalBehavior = createDefaultGlobalBehavior();
    const projectConfig = createDefaultProjectConfig('/test', 'test');
    const projectBehavior = createDefaultProjectBehavior();

    expect(globalConfig.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(globalBehavior.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(projectConfig.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(projectBehavior.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });
});
