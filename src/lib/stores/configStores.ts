import { writable } from 'svelte/store';
import type { GlobalConfig, ProjectConfig, ProjectBehavior, AuthToken } from '../types/data';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  loadProjectConfig,
  saveProjectConfig,
  loadBehavior,
  saveBehavior,
} from '../data/config';
import { initAuth } from '../auth/auth';
import { autoDetectRunCommand } from '../system/detector';
import { initWindowManager, setAppWindowClass } from '../system/windowManager';
import { devLog, devError } from '../utils/devLog';

// ─── Auth Token Store ────────────────────────────────────────────────────────

export const authToken = writable<AuthToken | null>(null);

// ─── Global Config Store ─────────────────────────────────────────────────────
// Loaded once on app start. Written back on changes.

export const globalConfig = writable<GlobalConfig | null>(null);

export async function initGlobalConfig(): Promise<GlobalConfig> {
  const config = await loadGlobalConfig();
  globalConfig.set(config);
  return config;
}

/**
 * Initialize the entire app: global config + auth.
 * Call this instead of initGlobalConfig() directly.
 */
export async function initApp(): Promise<GlobalConfig> {
  devLog('lifecycle', 'initApp: loading global config');
  const config = await initGlobalConfig();
  devLog('lifecycle', 'initApp: global config loaded', { userId: config.user.id });

  // Attempt backend auth (non-blocking — mock mode works without it)
  try {
    const token = await initAuth(config);
    authToken.set(token);
    devLog('lifecycle', 'initApp: auth initialized');
  } catch (e) {
    devLog('lifecycle', 'initApp: auth failed, continuing in mock mode');
    devError('error', 'Auth initialization failed', e);
  }

  return config;
}

export async function updateGlobalConfig(
  updater: (config: GlobalConfig) => GlobalConfig,
): Promise<void> {
  let current: GlobalConfig | null = null;
  globalConfig.subscribe(v => (current = v))();
  if (!current) return;

  const updated = updater(current);
  globalConfig.set(updated);
  await saveGlobalConfig(updated);
}

// ─── Project Config Store ────────────────────────────────────────────────────
// Loaded when a project is opened. Cleared when project is closed.

export const projectConfig = writable<ProjectConfig | null>(null);

export async function openProject(projectPath: string): Promise<ProjectConfig> {
  devLog('fs', `openProject: loading config from ${projectPath}`);
  const config = await loadProjectConfig(projectPath);
  devLog('fs', 'openProject: config loaded', { name: config.project.name, techStack: config.tech_stack?.type_detected });

  // Initialize window manager for RT/LT switching
  devLog('fs', 'openProject: initializing window manager');
  await initWindowManager();
  if (config.run_config.window_class) {
    setAppWindowClass(config.run_config.window_class);
  }
  devLog('fs', 'openProject: window manager ready');

  // Auto-detect run command if not already configured
  if (!config.run_config.command) {
    const detected = await autoDetectRunCommand(projectPath);
    if (detected.autoDetected) {
      config.run_config.command = detected.command;
      config.run_config.auto_detected = true;
      config.run_config.detection_source = detected.source;
      config.run_config.working_directory = projectPath;
      await saveProjectConfig(projectPath, config);
      devLog('fs', `openProject: auto-detected run command: ${detected.command} (${detected.source})`);
    }
  }

  projectConfig.set(config);
  devLog('fs', `openProject: complete — ${config.project.name}`);
  return config;
}

export async function updateProjectConfig(
  updater: (config: ProjectConfig) => ProjectConfig,
): Promise<void> {
  let current: ProjectConfig | null = null;
  projectConfig.subscribe(v => (current = v))();
  if (!current) return;

  const updated = updater(current);
  projectConfig.set(updated);
  await saveProjectConfig(updated.project.path, updated);
}

export function closeProject(): void {
  projectConfig.set(null);
  projectBehavior.set(null);
}

// ─── Project Behavior Store ──────────────────────────────────────────────────
// Loaded alongside project config. Written on behavior changes.

export const projectBehavior = writable<ProjectBehavior | null>(null);

export async function loadProjectBehavior(projectPath: string): Promise<ProjectBehavior> {
  const behavior = await loadBehavior(projectPath);
  projectBehavior.set(behavior);
  return behavior;
}

export async function updateProjectBehavior(
  projectPath: string,
  updater: (behavior: ProjectBehavior) => ProjectBehavior,
): Promise<void> {
  let current: ProjectBehavior | null = null;
  projectBehavior.subscribe(v => (current = v))();
  if (!current) return;

  const updated = updater(current);
  projectBehavior.set(updated);
  await saveBehavior(projectPath, updated);
}
