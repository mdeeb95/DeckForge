# Task: Add Run App Button + Keyboard Shortcut

## Problem

The app launcher (`appLauncher.ts`) only triggers via R4 (right back grip) — a gamepad-only button with no keyboard fallback. On a Mac during development, there's no way to launch the project's app from inside DeckForge. There's also no visible UI button for it anywhere.

## Solution

Add a "Run App" option to the L1 (Category Select) screen and add a keyboard shortcut (`r`) for dev testing.

### 1. Add keyboard mapping for R4

In `src/App.svelte`, add `r` to the `keyToButton` map:

```typescript
const keyToButton: Record<string, string> = {
  ArrowUp: 'DPAD_UP',
  ArrowDown: 'DPAD_DOWN',
  ArrowLeft: 'DPAD_LEFT',
  ArrowRight: 'DPAD_RIGHT',
  Enter: 'A',
  Escape: 'B',
  q: 'X',
  e: 'Y',
  Tab: 'RB',
  m: 'START',
  v: 'SELECT',
  r: 'R4',    // Run/restart app
};
```

### 2. Add Run App secondary button to Level1Screen

The L1 screen already has START → QA Mode and SELECT → History as secondary buttons below the category cards. Add an R4 → Run App button in the same style.

In `src/lib/screens/Level1Screen.svelte`, add a secondary button row for Run App:

```svelte
<!-- Run App -->
<div class="relative group">
  <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer"
    onclick={() => import('../system/appLauncher').then(m => m.restartApp())}>
    <div class="flex items-center gap-3">
      <div class="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-500/30">R4</div>
      <span class="text-xs text-slate-300 font-medium">Run App</span>
    </div>
    <span class="material-icons text-emerald-400 text-sm">play_arrow</span>
  </div>
</div>
```

Place it between the existing QA Mode and History buttons.

### 3. Show app status reactively

Import the launcher stores and show running state:

```typescript
import { appRunning, appPid } from '../stores/launcher';
```

Update the button to show status:

```svelte
<div class="flex items-center gap-3">
  <div class="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-500/30">
    {$appRunning ? 'R4' : 'R4'}
  </div>
  <span class="text-xs text-slate-300 font-medium">
    {$appRunning ? `App Running (PID ${$appPid})` : 'Run App'}
  </span>
</div>
<span class="material-icons text-sm {$appRunning ? 'text-emerald-400' : 'text-slate-500'}">
  {$appRunning ? 'stop_circle' : 'play_arrow'}
</span>
```

When app is already running, clicking R4 calls `restartApp()` (kills + relaunches). This matches the existing behavior.

### 4. Add to HintGrid on L1

If L1 has a HintGrid, add the R4 hint:

```typescript
{ key: 'R4', label: 'Run App' }
```

Or if using keyboard on Mac:
```typescript
{ key: 'R', label: 'Run App' }
```

### 5. Ensure auto-detect runs on project open

In `src/lib/stores/configStores.ts`, verify that `openProject()` calls `autoDetectRunCommand()` from `src/lib/system/detector.ts` when no `run_config.command` is set. This ensures the run command is populated when the user opens any project (not just demo mode).

Check that the detector correctly reads `package.json` scripts and populates `run_config.command` (e.g., `node server.js` from the `start` script).

## Verification

1. Open DeckForge with a project loaded (demo mode or manual open)
2. On L1, see the "Run App" button with play icon
3. Press `r` on keyboard (or R4 on gamepad)
4. App should launch — check dev console for appLauncher logs
5. Button should update to show "App Running (PID XXXXX)" with green indicator
6. Press `r` again — app restarts (kills old process, spawns new one)
7. For Pong demo: `node server.js` runs, `localhost:3000` serves the game
