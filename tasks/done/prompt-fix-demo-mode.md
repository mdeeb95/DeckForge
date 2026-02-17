# Task: Fix Demo Mode Button + Diagnostics

## Problem

The Y button "Demo Mode" on the EmptyStateScreen doesn't work. The user has to manually use "Open Directory" (A) and point at `src/lib/demo/pong-template` as a workaround, which sets the wrong cwd for Claude Code.

Demo mode SHOULD:
1. Create `~/projects/pong-demo/` with template files
2. Run `npm install`
3. Open the project config
4. Navigate to Level 1

## Diagnosis Steps

First, add visible diagnostics to the scaffolder and EmptyStateScreen so we can see what's failing. The error might be:
- Tauri FS permission issue (though `$HOME/**` globs should cover it)
- `npm install` failing and silently breaking something
- `openProject()` failing to read the created config
- PATH issues for npm command

### 1. Add visible error reporting to EmptyStateScreen.svelte

The current catch block sets `demoError` but it only shows in the card description text (easy to miss on gamepad). Add a more visible diagnostic:

In `launchDemo()`, wrap each step with individual try/catch:

```typescript
async function launchDemo() {
  devLog('lifecycle', 'Demo Mode: starting scaffold');
  demoStatus = 'loading';
  isDemoMode.set(true);
  try {
    devLog('lifecycle', 'Demo Mode: calling scaffoldDemoProject...');
    const path = await scaffoldDemoProject();
    devLog('lifecycle', `Demo Mode: scaffold returned path: ${path}`);

    devLog('lifecycle', 'Demo Mode: calling openProject...');
    await openProject(path);
    devLog('lifecycle', 'Demo Mode: openProject complete');

    projectName.set('pong-demo');
    devLog('lifecycle', 'Demo Mode: navigating to L1');
    navigate('level1');
  } catch (e) {
    devError('error', 'Demo Mode failed', e);
    demoStatus = 'error';
    demoError = e instanceof Error ? e.message : String(e);
    isDemoMode.set(false);
  }
}
```

### 2. Add diagnostics to scaffolder.ts

In `scaffoldDemoProject()`, add devLog before each critical step and wrap each FS operation in its own try/catch to identify the exact failure point:

```typescript
export async function scaffoldDemoProject(): Promise<string> {
  devLog('fs', 'Scaffolder: starting');

  if (!isTauri()) {
    devLog('fs', 'Scaffolder: not in Tauri');
    return '/mock/projects/pong-demo';
  }

  try {
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
    const { homeDir } = await import('@tauri-apps/api/path');
    devLog('fs', 'Scaffolder: Tauri APIs imported OK');

    const home = (await homeDir()).replace(/\/+$/, '');
    const projectPath = `${home}/projects/pong-demo`;
    devLog('fs', `Scaffolder: target path = ${projectPath}`);

    // Create directory
    try {
      const dirExists = await exists(projectPath);
      devLog('fs', `Scaffolder: dir exists = ${dirExists}`);
      if (!dirExists) {
        await mkdir(projectPath, { recursive: true });
        devLog('fs', 'Scaffolder: created project dir');
      }
    } catch (e) {
      devError('fs', `Scaffolder: FAILED to create dir: ${e}`);
      throw e;
    }

    // Write files
    try {
      await writeTextFile(`${projectPath}/package.json`, packageJson);
      await writeTextFile(`${projectPath}/server.js`, serverJs);
      await writeTextFile(`${projectPath}/index.html`, indexHtml);
      devLog('fs', 'Scaffolder: template files written');
    } catch (e) {
      devError('fs', `Scaffolder: FAILED to write files: ${e}`);
      throw e;
    }

    // .claude dir
    try {
      const claudeDir = `${projectPath}/.claude`;
      const claudeDirExists = await exists(claudeDir);
      if (!claudeDirExists) {
        await mkdir(claudeDir, { recursive: true });
      }
      await writeTextFile(`${claudeDir}/CLAUDE.md`, CLAUDE_MD);
      devLog('fs', 'Scaffolder: CLAUDE.md written');
    } catch (e) {
      devError('fs', `Scaffolder: FAILED to write CLAUDE.md: ${e}`);
      throw e;
    }

    // .deckforge config
    try {
      const config = createDefaultProjectConfig(projectPath, 'pong-demo', 'template');
      config.tech_stack = { /* ... keep existing ... */ };
      config.run_config = { /* ... keep existing ... */ };
      await saveProjectConfig(projectPath, config);
      devLog('fs', 'Scaffolder: project config saved');
    } catch (e) {
      devError('fs', `Scaffolder: FAILED to save config: ${e}`);
      throw e;
    }

    // npm install (non-fatal)
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      devLog('fs', 'Scaffolder: starting npm install');
      const cmd = Command.create('sh', ['-c', `cd '${projectPath}' && npm install`], { cwd: projectPath });
      const output = await cmd.execute();
      if (output.code !== 0) {
        devError('fs', `Scaffolder: npm install exited ${output.code}`, output.stderr);
      } else {
        devLog('fs', 'Scaffolder: npm install complete');
      }
    } catch (e) {
      devError('fs', 'Scaffolder: npm install failed (non-fatal)', e);
      // Don't rethrow — npm install failure shouldn't block the demo
    }

    devLog('fs', `Scaffolder: complete at ${projectPath}`);
    return projectPath;
  } catch (e) {
    devError('fs', 'Scaffolder: FATAL error', e);
    throw new Error(`Demo scaffold failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

### 3. Check openProject (in configStores.ts)

Verify that `openProject(path)` can load the `.deckforge/project.json` from the scaffolded path. If the config was written with `saveProjectConfig` but `openProject` reads from a different location, that would silently fail.

Look at `openProject()` in `src/lib/stores/configStores.ts` and ensure it reads from `${path}/.deckforge/project.json`. If it reads from a different location (like `$HOME/.config/deckforge/`), that's the bug.

### 4. Ensure npm PATH works in Tauri

The `npm install` step uses `Command.create('sh', ['-c', 'npm install'])`. On macOS, Tauri apps launched from Finder/Spotlight don't inherit the shell PATH, so `npm` may not be found. Fix by using the full path or sourcing the profile:

```typescript
const cmd = Command.create('sh', ['-c', 'source ~/.zshrc 2>/dev/null; cd "${projectPath}" && npm install'], { cwd: projectPath });
```

Or use the `npm` command name which is already in the Tauri shell allowlist:
```typescript
const cmd = Command.create('npm', ['install'], { cwd: projectPath });
```

This is cleaner since `npm` is already in the capabilities allowlist.

## Verification

After applying fixes:
1. Open DeckForge fresh (no projects loaded)
2. Press Y for Demo Mode
3. Watch the dev console for the scaffolder diagnostics
4. Should see: dir created → files written → config saved → npm install → navigate to L1
5. On L1, project name should show "PONG-DEMO" in the header
6. Selecting Feature → L2 should show Pong-specific suggestions
7. Ship It should spawn claude with cwd `~/projects/pong-demo` (NOT `src/lib/demo/pong-template`)
