# Prompt: Dev Observability System + Demo Mode Fix

## Context
DeckForge is a gamepad-only Tauri 2 + Svelte 5 app. We have near-zero logging — when the user presses buttons, nothing appears in the console. Errors are silently caught and logged to `console.error` which the user never sees. We need structured, visible logging for every user interaction, and we need to fix Demo Mode which silently fails.

## Part 1: Create a Dev Logger Utility

Create `src/lib/utils/devLog.ts`:

```ts
// Dev-mode structured logger with color-coded categories.
// All output goes to browser console (visible in Tauri devtools via Ctrl+Shift+I).
// In production builds, logging is suppressed.

const isDev = import.meta.env.DEV;

type Category = 'input' | 'nav' | 'store' | 'claude' | 'fs' | 'error' | 'lifecycle';

const COLORS: Record<Category, string> = {
  input: '#0df2f2',     // cyan — matches primary
  nav: '#a78bfa',       // purple
  store: '#fbbf24',     // amber
  claude: '#34d399',    // green
  fs: '#60a5fa',        // blue
  error: '#f87171',     // red
  lifecycle: '#94a3b8',  // slate
};

export function devLog(category: Category, message: string, data?: unknown): void {
  if (!isDev) return;
  const color = COLORS[category];
  const prefix = `%c[${category.toUpperCase()}]`;
  if (data !== undefined) {
    console.log(prefix, `color: ${color}; font-weight: bold`, message, data);
  } else {
    console.log(prefix, `color: ${color}; font-weight: bold`, message);
  }
}

export function devError(category: Category, message: string, error: unknown): void {
  if (!isDev) return;
  const color = COLORS[category];
  console.error(`%c[${category.toUpperCase()}]`, `color: ${color}; font-weight: bold`, message, error);
}
```

## Part 2: Wire Logging Into the Input System

### inputRouter.ts
Add `devLog('input', ...)` at every button handler entry point. For EVERY case in the router (each screen × each button), log:
```ts
devLog('input', `${screen} → ${button} pressed`);
```
At the very top of the `handleInput` function (or equivalent), before any screen-specific routing:
```ts
devLog('input', `Button: ${button} | Screen: ${currentScreen}`);
```

### navigation.ts
In `navigateUp()` and `navigateDown()`:
```ts
devLog('input', `D-pad ${direction}: selectedCardIndex ${oldIndex} → ${newIndex} (${cards.length} cards)`);
```
In `activateByButton()`:
```ts
devLog('input', `Activate button ${button}: ${card ? card.title : 'NO CARD FOUND'}`, { hasOnclick: !!card?.onclick });
```

### gamepad.ts
At the edge-detection point where a button press is registered:
```ts
devLog('input', `Gamepad button ${index} pressed (${buttonName})`);
```

## Part 3: Wire Logging Into Navigation & Stores

### stores/app.ts
In `navigate()`:
```ts
devLog('nav', `Navigating: ${previousScreen} → ${screen}`);
```

In `screenCards.set()` (wrap or intercept):
```ts
devLog('store', `screenCards updated: ${cards.length} cards [${cards.map(c => c.button).join(', ')}]`, cards.map(c => ({ button: c.button, title: c.title, hasOnclick: !!c.onclick })));
```

In `selectedCardIndex.set()` (or wherever it updates):
```ts
devLog('store', `selectedCardIndex → ${index}`);
```

### stores/configStores.ts
In `openProject()`:
```ts
devLog('fs', `Opening project: ${projectPath}`);
// ... after loading config:
devLog('fs', `Project config loaded`, { name: config.project.name, techStack: config.tech_stack?.type_detected });
```

## Part 4: Wire Logging Into Claude Subprocess

### claude/subprocess.ts
Replace the existing `console.log/warn/error` calls with `devLog`/`devError`:
```ts
devLog('claude', `isTauri() = ${tauriDetected}`);
devLog('claude', `Spawning claude with ${args.length} args`, args);
devLog('claude', `cwd: ${options.projectPath}`);
devLog('claude', `Spawned — PID ${child.pid}`);
devLog('claude', `stdout event: ${event.type}`, event.type === 'result' ? event : undefined);
devError('claude', `Spawn failed`, error);
```
Keep the `emitDiag()` calls too — those show in the terminal panel UI. The `devLog` calls go to the browser console for developer debugging.

## Part 5: Fix Demo Mode

### Problem
In `EmptyStateScreen.svelte`, `launchDemo()` catches errors and logs them to `console.error` only. The user sees nothing — the button appears dead.

### Fix 1: Add visible feedback state
Add a reactive error/loading state to EmptyStateScreen:
```ts
let demoStatus = $state<'idle' | 'loading' | 'error'>('idle');
let demoError = $state<string>('');
```

Update `launchDemo()`:
```ts
async function launchDemo() {
  devLog('lifecycle', 'Demo Mode: starting scaffold');
  demoStatus = 'loading';
  isDemoMode.set(true);
  try {
    const path = await scaffoldDemoProject();
    devLog('lifecycle', `Demo Mode: scaffold complete at ${path}`);
    await openProject(path);
    devLog('lifecycle', 'Demo Mode: project opened, navigating to L1');
    projectName.set('pong-demo');
    navigate('level1');
  } catch (e) {
    devError('error', 'Demo Mode scaffold failed', e);
    demoStatus = 'error';
    demoError = e instanceof Error ? e.message : String(e);
    isDemoMode.set(false);
  }
}
```

### Fix 2: Show loading/error in the Y card
When `demoStatus === 'loading'`, show a pulsing indicator on the Y card description:
```
"Setting up Pong demo..."
```
When `demoStatus === 'error'`, show the error:
```
"Failed: {demoError}"
```
Use red text (`text-red-400`) for errors so it's immediately visible.

### Fix 3: Add logging to scaffolder.ts
In `scaffoldDemoProject()`, add `devLog` at each step:
```ts
devLog('fs', 'Scaffolder: isTauri check', { isTauri: isTauri() });
devLog('fs', `Scaffolder: writing to ${projectPath}`);
devLog('fs', 'Scaffolder: directory created');
devLog('fs', 'Scaffolder: template files written');
devLog('fs', 'Scaffolder: CLAUDE.md written');
devLog('fs', 'Scaffolder: project config saved');
devLog('fs', 'Scaffolder: running npm install');
devLog('fs', `Scaffolder: complete at ${projectPath}`);
```

### Fix 4: Add logging to openProject in configStores.ts
Each step that could fail should log before AND after:
```ts
devLog('fs', `openProject: loading config from ${projectPath}`);
// const config = await loadProjectConfig(projectPath);
devLog('fs', 'openProject: config loaded', config.project);
devLog('fs', 'openProject: initializing window manager');
// await initWindowManager();
devLog('fs', 'openProject: window manager ready');
```

## Part 6: Make ALL EmptyState Buttons Give Feedback

The B (Paste Path) and X (Clone from Git) buttons currently only do `console.log`. Update them:

### pastePath
Change from placeholder to show a toast or card description update:
```ts
function pastePath() {
  devLog('lifecycle', 'Paste Path: not yet implemented');
  // For now, update the B card description to show "Coming soon"
  // or navigate to a text input screen if one exists
}
```

### cloneFromGit
Same pattern:
```ts
function cloneFromGit() {
  devLog('lifecycle', 'Clone from Git: not yet implemented');
}
```

For both, since they're placeholders, at minimum change the card description text reactively to "Coming soon — not yet implemented" when pressed, so the user gets SOME feedback.

## Important Notes
- Import `devLog` and `devError` from `'../utils/devLog'` (adjust relative path per file)
- Use Svelte 5 syntax: `$state` not `let` for reactive variables
- Keep ALL existing `emitDiag()` calls in subprocess.ts — those serve a different purpose (visible in the app UI)
- The devLog output goes to browser console only — access via Ctrl+Shift+I in the Tauri window or by right-clicking in the webview
- Do NOT add scroll to any screen — 1280×800 is fixed
- Run `npm test` after changes to verify nothing breaks
