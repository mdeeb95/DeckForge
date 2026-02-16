import { writable } from 'svelte/store';
import type { GlobalConfig, ProjectConfig, ProjectBehavior } from '../types/data';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  loadProjectConfig,
  saveProjectConfig,
  loadBehavior,
  saveBehavior,
} from '../data/config';

// ─── Global Config Store ─────────────────────────────────────────────────────
// Loaded once on app start. Written back on changes.

export const globalConfig = writable<GlobalConfig | null>(null);

export async function initGlobalConfig(): Promise<GlobalConfig> {
  const config = await loadGlobalConfig();
  globalConfig.set(config);
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
  const config = await loadProjectConfig(projectPath);
  projectConfig.set(config);
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
