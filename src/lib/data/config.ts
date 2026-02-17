import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { homeDir } from '@tauri-apps/api/path';
import type { GlobalConfig, GlobalBehavior, ProjectConfig, ProjectBehavior } from '../types/data';
import { CURRENT_SCHEMA_VERSION } from '../types/data';
import {
  createDefaultGlobalConfig,
  createDefaultGlobalBehavior,
  createDefaultProjectConfig,
  createDefaultProjectBehavior,
} from './defaults';
import { devLog, devError } from '../utils/devLog';

// ─── Path helpers ────────────────────────────────────────────────────────────

let cachedHome: string | null = null;

async function getHomeDir(): Promise<string> {
  if (cachedHome) return cachedHome;
  const home = await homeDir();
  cachedHome = home.replace(/\/+$/, '');
  return cachedHome;
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

async function getGlobalConfigDir(): Promise<string> {
  const home = await getHomeDir();
  return joinPath(home, '.config', 'deckforge');
}

async function ensureDir(dir: string): Promise<void> {
  const dirExists = await exists(dir);
  if (!dirExists) {
    await mkdir(dir, { recursive: true });
  }
}

async function readJsonFile<T>(path: string): Promise<T> {
  const content = await readTextFile(path);
  return JSON.parse(content) as T;
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await writeTextFile(path, JSON.stringify(data, null, 2));
}

// ─── Schema validation ──────────────────────────────────────────────────────

function validateSchemaVersion(data: { schema_version?: number }, filePath: string): void {
  if (!data.schema_version) {
    devLog('fs', `Missing schema_version in ${filePath}, treating as v1`);
    return;
  }
  if (data.schema_version > CURRENT_SCHEMA_VERSION) {
    devLog('fs', `${filePath} has schema_version ${data.schema_version} (newer than app v${CURRENT_SCHEMA_VERSION}). Loading in read-only mode.`);
  }
  // Future: run migrations if data.schema_version < CURRENT_SCHEMA_VERSION
}

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Global Config ───────────────────────────────────────────────────────────
// File: ~/.config/deckforge/global.json

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  if (!isTauri()) {
    devLog('fs', 'Not running in Tauri, using default global config');
    return createDefaultGlobalConfig();
  }

  try {
    const configDir = await getGlobalConfigDir();
    const configPath = joinPath(configDir, 'global.json');

    const fileExists = await exists(configPath);
    if (!fileExists) {
      const defaults = await createDefaultGlobalConfig();
      await ensureDir(configDir);
      await writeJsonFile(configPath, defaults);
      return defaults;
    }

    const config = await readJsonFile<GlobalConfig>(configPath);
    validateSchemaVersion(config, configPath);
    return config;
  } catch (error) {
    devError('fs', 'Failed to load global config', error);
    return createDefaultGlobalConfig();
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  if (!isTauri()) return;

  try {
    const configDir = await getGlobalConfigDir();
    await ensureDir(configDir);
    await writeJsonFile(joinPath(configDir, 'global.json'), config);
  } catch (error) {
    devError('fs', 'Failed to save global config', error);
  }
}

// ─── Global Behavior ─────────────────────────────────────────────────────────
// File: ~/.config/deckforge/behavior-global.json

export async function loadGlobalBehavior(): Promise<GlobalBehavior> {
  if (!isTauri()) {
    return createDefaultGlobalBehavior();
  }

  try {
    const configDir = await getGlobalConfigDir();
    const filePath = joinPath(configDir, 'behavior-global.json');

    const fileExists = await exists(filePath);
    if (!fileExists) {
      const defaults = createDefaultGlobalBehavior();
      await ensureDir(configDir);
      await writeJsonFile(filePath, defaults);
      return defaults;
    }

    const behavior = await readJsonFile<GlobalBehavior>(filePath);
    validateSchemaVersion(behavior, filePath);
    return behavior;
  } catch (error) {
    devError('fs', 'Failed to load global behavior', error);
    return createDefaultGlobalBehavior();
  }
}

export async function saveGlobalBehavior(behavior: GlobalBehavior): Promise<void> {
  if (!isTauri()) return;

  try {
    const configDir = await getGlobalConfigDir();
    await ensureDir(configDir);
    await writeJsonFile(joinPath(configDir, 'behavior-global.json'), behavior);
  } catch (error) {
    devError('fs', 'Failed to save global behavior', error);
  }
}

// ─── Project Config ──────────────────────────────────────────────────────────
// File: <projectPath>/.deckforge/project.json

function getDeckforgeDir(projectPath: string): string {
  return joinPath(projectPath, '.deckforge');
}

export async function loadProjectConfig(projectPath: string): Promise<ProjectConfig> {
  if (!isTauri()) {
    const name = projectPath.split('/').pop() || 'project';
    return createDefaultProjectConfig(projectPath, name);
  }

  try {
    const deckforgeDir = getDeckforgeDir(projectPath);
    const configPath = joinPath(deckforgeDir, 'project.json');

    const fileExists = await exists(configPath);
    if (!fileExists) {
      const name = projectPath.split('/').pop() || 'project';
      const defaults = createDefaultProjectConfig(projectPath, name);
      await ensureProjectDirs(projectPath);
      await writeJsonFile(configPath, defaults);
      return defaults;
    }

    const config = await readJsonFile<ProjectConfig>(configPath);
    validateSchemaVersion(config, configPath);

    // SAFETY: Always use the incoming projectPath as canonical.
    // The stored project.path may be stale from a previous run.
    if (config.project.path !== projectPath) {
      devLog('fs', `loadProjectConfig: correcting stale project.path from "${config.project.path}" to "${projectPath}"`);
      config.project.path = projectPath;
      await writeJsonFile(configPath, config);
    }

    return config;
  } catch (error) {
    devError('fs', 'Failed to load project config', error);
    const name = projectPath.split('/').pop() || 'project';
    return createDefaultProjectConfig(projectPath, name);
  }
}

export async function saveProjectConfig(
  projectPath: string,
  config: ProjectConfig,
): Promise<void> {
  if (!isTauri()) return;

  try {
    await ensureProjectDirs(projectPath);
    await writeJsonFile(joinPath(getDeckforgeDir(projectPath), 'project.json'), config);
  } catch (error) {
    devError('fs', 'Failed to save project config', error);
  }
}

// ─── Project Behavior ────────────────────────────────────────────────────────
// File: <projectPath>/.deckforge/behavior.json

export async function loadBehavior(projectPath: string): Promise<ProjectBehavior> {
  if (!isTauri()) {
    return createDefaultProjectBehavior();
  }

  try {
    const deckforgeDir = getDeckforgeDir(projectPath);
    const filePath = joinPath(deckforgeDir, 'behavior.json');

    const fileExists = await exists(filePath);
    if (!fileExists) {
      const defaults = createDefaultProjectBehavior();
      await ensureProjectDirs(projectPath);
      await writeJsonFile(filePath, defaults);
      return defaults;
    }

    const behavior = await readJsonFile<ProjectBehavior>(filePath);
    validateSchemaVersion(behavior, filePath);
    return behavior;
  } catch (error) {
    devError('fs', 'Failed to load project behavior', error);
    return createDefaultProjectBehavior();
  }
}

export async function saveBehavior(
  projectPath: string,
  behavior: ProjectBehavior,
): Promise<void> {
  if (!isTauri()) return;

  try {
    await ensureProjectDirs(projectPath);
    await writeJsonFile(joinPath(getDeckforgeDir(projectPath), 'behavior.json'), behavior);
  } catch (error) {
    devError('fs', 'Failed to save project behavior', error);
  }
}

// ─── Directory scaffolding ───────────────────────────────────────────────────
// Creates .deckforge/, .deckforge/cache/, .deckforge/screenshots/

async function ensureProjectDirs(projectPath: string): Promise<void> {
  const deckforgeDir = getDeckforgeDir(projectPath);
  await ensureDir(deckforgeDir);
  await ensureDir(joinPath(deckforgeDir, 'cache'));
  await ensureDir(joinPath(deckforgeDir, 'screenshots'));
}
