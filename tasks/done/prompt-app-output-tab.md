# Task: Add App Output Tab to Terminal Panel

## Goal

Add a tab system to the left-side terminal panel with two tabs: "Claude Code" (existing stream) and "App Output" (stdout/stderr from the user's running app). Switch between them with SELECT button or clicking the tab.

## Current State

- `TerminalPanel.svelte` renders Claude Code events from the `entries` store
- `appOutput` store in `launcher.ts` already captures stdout/stderr lines (last 200)
- `appRunning` and `appPid` stores track app process state
- No tab system exists — the panel is always Claude Code

## Design

### Tab Bar
Two tabs at the top of the terminal panel, inside the existing header bar:

```
> Claude Code Stream  [STREAMING]     $ Session: $0.14
  ──────────────────────────────
  [Claude Code]  [App Output ●]
```

- Tabs sit just below the existing header, above the scrollable content
- Active tab: `text-primary border-b-2 border-primary`
- Inactive tab: `text-slate-500 hover:text-slate-300`
- App Output tab shows a green `●` dot when the app is running
- App Output tab shows a red `●` when app crashed (non-zero exit)
- Tab switches via click OR SELECT button (cycles between tabs)

### App Output View

When the "App Output" tab is active, render `$appOutput` lines instead of `$entries`:

```svelte
{#each $appOutput as line}
  <div class="text-slate-400">{line}</div>
{/each}
```

With some enhancements:
- Lines starting with `Error` or containing `ERR` → `text-red-400`
- Lines containing `listening on` or `started` → `text-emerald-400`
- Lines containing `GET` or `POST` → `text-blue-400` (HTTP requests)
- All other lines → `text-slate-400`

When app is not running, show:
```
No app running. Press R4 to launch.
```

### Header Updates

When App Output tab is active, change the header to show app info instead of Claude session info:

```
> App Output  [RUNNING]                    PID: 54321
```

Or when stopped:
```
> App Output  [STOPPED]
```

## Files to Modify

### 1. `src/lib/stores/terminal.ts` — Add active tab store

```typescript
export type TerminalTab = 'claude' | 'app';
export const activeTab = writable<TerminalTab>('claude');
```

### 2. `src/lib/components/TerminalPanel.svelte` — Add tab bar + app output view

Import new stores:
```typescript
import { activeTab, type TerminalTab } from '../stores/terminal';
import { appOutput, appRunning, appPid } from '../stores/launcher';
```

Add tab bar below the existing header:
```svelte
<!-- Tab Bar -->
<div class="flex border-b border-surface-border bg-surface-dark/30 shrink-0">
  <button
    class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors
      {$activeTab === 'claude' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-300'}"
    onclick={() => activeTab.set('claude')}
  >
    Claude Code
  </button>
  <button
    class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5
      {$activeTab === 'app' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-300'}"
    onclick={() => activeTab.set('app')}
  >
    App Output
    {#if $appRunning}
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
    {/if}
  </button>
</div>
```

Conditionally render content based on active tab:
```svelte
<!-- Terminal Content -->
<div bind:this={contentEl} class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed scroll-smooth">
  {#if $activeTab === 'claude'}
    <!-- Existing entry rendering (unchanged) -->
    {#each $entries as entry}
      <!-- ... all existing entry rendering ... -->
    {/each}
  {:else}
    <!-- App Output -->
    {#if $appOutput.length === 0}
      <div class="text-slate-500 italic">
        {$appRunning ? 'Waiting for output...' : 'No app running. Press R4 to launch.'}
      </div>
    {:else}
      {#each $appOutput as line}
        <div class="{getAppLineClass(line)}">{line}</div>
      {/each}
    {/if}
  {/if}
</div>
```

Add the line colorizer function:
```typescript
function getAppLineClass(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('err!') || lower.includes('failed')) return 'text-red-400';
  if (lower.includes('warn')) return 'text-amber-400';
  if (lower.includes('listening') || lower.includes('started') || lower.includes('ready')) return 'text-emerald-400';
  if (/\b(GET|POST|PUT|DELETE|PATCH)\b/.test(line)) return 'text-blue-400';
  return 'text-slate-400';
}
```

Update the header to be tab-aware:
```svelte
<!-- Terminal Header -->
<div class="h-10 flex items-center justify-between px-4 border-b border-surface-border bg-surface-dark/50 shrink-0">
  <div class="flex items-center gap-2">
    {#if $activeTab === 'claude'}
      <span class="text-primary font-mono text-sm">&gt; Claude Code Stream</span>
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border {badgeClasses[$status]}">{badgeLabels[$status]}</span>
    {:else}
      <span class="text-primary font-mono text-sm">&gt; App Output</span>
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border
        {$appRunning ? 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30' : 'bg-slate-800 text-slate-500 border-slate-700'}">
        {$appRunning ? 'RUNNING' : 'STOPPED'}
      </span>
    {/if}
  </div>
  <div class="flex gap-2">
    {#if $activeTab === 'claude'}
      <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-surface-border text-[10px] text-slate-400 flex items-center gap-1">
        <span class="material-icons text-[10px]">attach_money</span>
        Session: {$cost}
      </span>
      {#if $scope}
        <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-surface-border text-[10px] text-slate-400 flex items-center gap-1">
          <span class="material-icons text-[10px]">description</span>
          {$scope}
        </span>
      {/if}
    {:else if $appPid}
      <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-surface-border text-[10px] text-slate-400">
        PID: {$appPid}
      </span>
    {/if}
  </div>
</div>
```

### 3. `src/lib/input/inputRouter.ts` — Wire SELECT to toggle tabs

Currently SELECT is mapped to something (Focus Log). Replace it with tab cycling:

Find the SELECT handler in the global or screen-specific handlers and update:

```typescript
SELECT: () => {
  const { activeTab } = await import('../stores/terminal');
  const current = get(activeTab);
  activeTab.set(current === 'claude' ? 'app' : 'claude');
  devLog('input', `SELECT → toggle terminal tab to ${current === 'claude' ? 'app' : 'claude'}`);
},
```

### 4. Auto-switch to App Output tab when app launches

In `src/lib/system/appLauncher.ts`, after successfully spawning the app process, auto-switch to the app tab:

```typescript
import { activeTab } from '../stores/terminal';

// After spawn succeeds:
activeTab.set('app');
```

And auto-switch back to Claude when a Claude session starts. In `src/lib/screens/AIWorkingScreen.svelte`, on mount:

```typescript
import { activeTab } from '../stores/terminal';
activeTab.set('claude');
```

## Verification

1. Open DeckForge with a project
2. Left panel shows "Claude Code" tab active by default
3. Press SELECT — switches to "App Output" tab showing "No app running. Press R4 to launch."
4. Press R4 — app starts, tab auto-switches to App Output, shows stdout in real-time
5. See `node server.js` output with `listening on port 3000` in green
6. HTTP requests show in blue as you interact with the app
7. Press SELECT — toggles back to Claude Code tab
8. Ship It on a feature — auto-switches to Claude Code tab
9. Header updates: shows "RUNNING" badge + PID when on App Output, shows "STREAMING" + cost when on Claude Code
