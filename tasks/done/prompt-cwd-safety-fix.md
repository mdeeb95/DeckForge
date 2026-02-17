# Prompt: Fix Project Path (cwd) Safety Issue

## Problem
When Claude Code is spawned from DeckForge, the `cwd` (working directory) can be wrong if the `.deckforge/project.json` file contains a stale `project.path` value from a previous run.

**What happened:** The DIAG output showed `cwd: /Users/mdeeb95/Documents/DeckForge/src/lib/demo/pong-template` (the source template directory) instead of `~/projects/pong-demo` (where the project was scaffolded). This means Claude Code would write files into the DeckForge source tree instead of the demo project.

**Root cause:** `loadProjectConfig()` in `config.ts` reads `project.path` from the stored JSON file without normalizing it against the incoming `projectPath` parameter. If a previous (bugged) run wrote the wrong path into the JSON, all subsequent runs inherit that wrong path.

## Fix

### 1. config.ts — Always normalize project.path on load

In `loadProjectConfig()` (around line 178), after reading the config from JSON, **always overwrite `project.path`** with the incoming `projectPath` parameter. The incoming path is the canonical source of truth (it comes from `openProject()` which gets it from the scaffolder or file dialog).

```ts
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
      // Persist the corrected path
      await writeJsonFile(configPath, config);
    }

    return config;
  } catch (error) {
    devError('error', 'Failed to load project config:', error);
    const name = projectPath.split('/').pop() || 'project';
    return createDefaultProjectConfig(projectPath, name);
  }
}
```

### 2. Also add devLog import if not already present

Make sure `config.ts` imports devLog:
```ts
import { devLog, devError } from '../utils/devLog';
```

And replace the existing `console.error` calls in config.ts with `devError` for consistency.

### 3. Clean up stale pong-demo config

Delete `~/projects/pong-demo/.deckforge/` so the next Demo Mode run creates a fresh config:
```bash
rm -rf ~/projects/pong-demo/.deckforge/
```

(Or just delete the whole `~/projects/pong-demo/` directory — the scaffolder will recreate it.)

## Important Notes
- The `projectPath` passed to `openProject()` is always the canonical path — it comes from the file dialog or the scaffolder return value
- The stored `project.path` in JSON should be treated as a cache that may be stale
- Use `devLog` not `console.log` — the codebase uses devLog for structured logging
- Run `npm test` after changes
