# Task: Wire Terminal Into DeckForge — Tab Restructure + Ship It Integration

## Prerequisite

Prompt 1 (`prompt-terminal-pty-xterm.md`) must be completed first. That adds the `TerminalEmulator.svelte` component and Rust PTY backend.

## Goal

Integrate the real xterm.js terminal into DeckForge's existing UI. The terminal tab becomes the primary view. When the user hits "Ship It" on L3, DeckForge writes the `claude` CLI command directly into the PTY. The user watches Claude Code run in a real terminal. When it finishes, DeckForge detects the exit and shows completion cards.

The current parsed/styled view (TerminalPanel.svelte's Claude Code Stream) moves to a secondary "Structured" tab or gets removed entirely — your call on whether to keep it around as a debug tool.

## Architecture

```
User hits Ship It → AIWorkingScreen builds claude command string
  → TerminalEmulator.writeCommand("claude -p '...' --verbose")
  → User watches real Claude Code in xterm.js
  → PTY emits "pty-exit" when claude process exits
  → AIWorkingScreen shows completion cards
```

## Changes Required

### 1. TerminalPanel.svelte — Add Terminal Tab + Restructure Tabs

The tab bar currently has two tabs: "Claude Code" and "App Output". Change to three:

- **Terminal** (new, default) — renders `TerminalEmulator`
- **App Output** (existing) — unchanged
- **Structured** (optional/debug) — the current parsed Claude Code stream

Update the `TerminalTab` type in `src/lib/stores/terminal.ts`:

```typescript
export type TerminalTab = 'terminal' | 'app' | 'structured';
```

Default should be `'terminal'`.

**In TerminalPanel.svelte:**

Import the new component:
```svelte
import TerminalEmulator from './TerminalEmulator.svelte';
```

Add a `let terminalRef: TerminalEmulator | undefined = $state();` to get a reference to the component.

Restructure the tab bar:
```svelte
<!-- Tab Bar -->
<div class="flex border-b border-surface-border bg-surface-dark/30 shrink-0">
  <button
    class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors
      {$activeTab === 'terminal' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-300'}"
    onclick={() => { activeTab.set('terminal'); terminalRef?.refit(); }}
  >
    Terminal
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

Note: The "Structured" tab is intentionally omitted from the UI for now. If you want it as a debug tool, add a third button gated behind a debug flag. The structured entries/parsing code can stay in the codebase — just don't show it in the main UI.

In the content area, add the terminal tab:
```svelte
<div class="flex-1 overflow-hidden {$activeTab !== 'terminal' ? 'hidden' : ''}">
  <TerminalEmulator
    bind:this={terminalRef}
    cwd={projectPath}
    onExit={handlePtyExit}
  />
</div>
```

Important: Use `hidden` class toggling (not `{#if}`) so the xterm.js instance stays alive across tab switches. Destroying and recreating xterm loses terminal state.

The existing Claude Code Stream content and App Output content should also use `hidden` toggling:
```svelte
<div bind:this={contentEl} class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed scroll-smooth {$activeTab !== 'structured' ? 'hidden' : ''}">
  <!-- existing $entries rendering -->
</div>

<div class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed {$activeTab !== 'app' ? 'hidden' : ''}">
  <!-- existing app output rendering -->
</div>
```

**Add props to TerminalPanel** so it can receive the project path and PTY exit handler from the parent screen:

```svelte
interface Props {
  projectPath?: string;
  onPtyExit?: () => void;
}
let { projectPath, onPtyExit }: Props = $props();
```

Pass the `onPtyExit` callback through to `TerminalEmulator`'s `onExit` prop.

Also expose the `terminalRef` so parent screens can call `writeCommand()`:

```svelte
export function getTerminal(): TerminalEmulator | undefined {
  return terminalRef;
}
```

### 2. Terminal Header — Simplify for Terminal Tab

When the "Terminal" tab is active, the header should be minimal:

```svelte
{#if $activeTab === 'terminal'}
  <span class="text-primary font-mono text-sm">&gt; Terminal</span>
  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border {ptyRunning ? badgeClasses.streaming : badgeClasses.idle}">
    {ptyRunning ? 'ACTIVE' : 'IDLE'}
  </span>
{:else if $activeTab === 'app'}
  <!-- existing app header -->
{:else}
  <!-- existing claude stream header (for structured tab if kept) -->
{/if}
```

Add a `ptyRunning` state that tracks whether the terminal has an active process:
```typescript
let ptyRunning = $state(false);
```

Set this to `true` when a command is injected, `false` when `onPtyExit` fires.

### 3. Remove Cost/Scope/Session Tracking from Header

Per Mathew's directive: DeckForge doesn't track Claude Code usage — that's the user's business. Remove:
- The `$cost` display
- The `$scope` display
- The session cost badge

These can stay in the stores (don't delete the store code), just remove them from the TerminalPanel header UI.

### 4. AIWorkingScreen.svelte — Use Terminal Instead of JSON Subprocess

This is the core integration. Currently `AIWorkingScreen` calls `sendPrompt()` from `subprocess.ts` which spawns Claude Code with `--output-format stream-json`. Instead, it should write a command into the PTY terminal.

**Replace the `fireClaude` function:**

Add an injection guard to prevent double Ship It:

```typescript
let commandInFlight = false; // prevents double-injection from gamepad bounce

function fireClaude(prompt: string) {
  if (commandInFlight) return; // guard: already running
  commandInFlight = true;

  sessionPrompt = prompt;
  wasUnhinged = false;
  startTime = Date.now();

  // Build the claude command string (same args as before, minus --output-format)
  const config = get(projectConfig);
  const projectPath = config?.project.path ?? '.';

  // Escape the prompt for shell safety
  const escapedPrompt = prompt.replace(/'/g, "'\\''");

  let args = [`-p '${escapedPrompt}'`, '--verbose'];

  // Session resume
  const sessionId = config?.claude_code.session_id ?? undefined;
  const currentSessionId = sessionId ?? getSessionState().sessionId;
  if (currentSessionId) {
    args.push('--resume', `--session-id '${currentSessionId}'`);
  }

  // Permission mode
  args.push('--permission-mode acceptEdits');

  // Allowed tools
  const tools = [
    'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'Bash(git *)', 'Bash(npm *)', 'Bash(npx *)',
    'Bash(python *)', 'Bash(pip *)', 'Bash(cargo *)',
    'Bash(make *)',
  ];
  for (const tool of tools) {
    args.push(`--allowed-tools '${tool}'`);
  }

  // System prompt
  const sysPrompt = "The user strongly prefers not to type — handle everything yourself. They CAN use a keyboard but it's a last resort. Provide clear progress updates. This project is controlled via a gamepad interface. Auto-commit after completing each task with a descriptive message.";
  args.push(`--append-system-prompt '${sysPrompt.replace(/'/g, "'\\''")}'`);

  args.push('--max-turns 50');

  // Get the resolved claude path
  const resolvedPath = get(claudePath);
  const claudeBin = resolvedPath ?? 'claude';

  const fullCommand = `${claudeBin} ${args.join(' ')}`;

  // Write command into the PTY terminal
  const terminalPanel = getTerminalPanelRef(); // however you wire the ref
  terminalPanel?.getTerminal()?.writeCommand(fullCommand);
}
```

**Replace the `onOutput` handler with PTY exit detection:**

Remove the entire `onOutput(...)` registration block. Instead, the completion signal comes from `TerminalEmulator`'s `onExit` callback, which fires when the `claude` process returns to the shell prompt (or when the PTY process exits).

Add a handler:

```typescript
function handlePtyExit() {
  commandInFlight = false; // allow new commands
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
  if (messageInterval) { clearInterval(messageInterval); messageInterval = null; }

  status.set('complete');
  taskComplete = true;

  screenCards.set([
    {
      title: 'Continue',
      description: 'Proceed to QA review.',
      onclick: handleContinue,
    },
    {
      button: 'B',
      title: 'Back to Home',
      description: 'Return to the main screen.',
      onclick: handleBackToHome,
    },
  ]);
}
```

Pass this down through TerminalPanel: `<TerminalPanel {projectPath} onPtyExit={handlePtyExit} />`

**Important nuance:** The `pty-exit` event fires when the *shell* exits, not when the `claude` command finishes. Since the PTY runs bash and we write `claude ...` as a command, the shell stays alive after claude exits. We need a different completion signal.

**Solution: Exit code probe via hidden ANSI sequence.**

After the claude command finishes, we write a completion marker that the user can't see but the frontend can detect. We use an ANSI Operating System Command (OSC) sequence — these are invisible in the terminal but present in the raw byte stream:

```typescript
// Generate a unique marker per invocation to prevent false matches
const marker = `DF_DONE_${Date.now()}`;

// OSC 7337 is a private-use sequence — terminals silently ignore unknown OSC codes.
// Format: ESC ] 7337 ; marker BEL
// The user never sees this. It's invisible in xterm.js.
const fullCommand = `${claudeBin} ${args.join(' ')}; printf '\\033]7337;${marker}\\007'`;
terminalPanel?.getTerminal()?.writeCommand(fullCommand);
```

Then in `TerminalEmulator.svelte`, add a prop for the active marker and scan the raw output:

```typescript
// Props
interface Props {
  cwd?: string;
  onExit?: () => void;
  completionMarker?: string; // set by parent when a command is injected
}

// In the pty-output listener:
unlistenOutput = await listen<string>('pty-output', (event) => {
  if (!terminal) return;
  terminal.write(event.payload);

  // Check for completion marker in raw stream
  if (completionMarker && event.payload.includes(completionMarker)) {
    onExit?.();
  }
});
```

**Why this is better than `echo "DECKFORGE_TASK_DONE"`:**
- The OSC sequence is **invisible** — the user never sees it in the terminal
- Each invocation gets a **unique marker** (timestamp), so a stale marker can't false-trigger
- OSC sequences can't appear in normal Claude Code output (it doesn't emit raw ESC codes as text)
- If the output chunk splits across the marker, the worst case is a delayed detection on the next chunk (the sequence is short enough that splitting is extremely unlikely — 20 bytes max)

**Edge case: chunk splitting.** Add a small buffer in the listener to handle the unlikely case where the OSC sequence spans two chunks:

```typescript
let markerBuffer = '';

unlistenOutput = await listen<string>('pty-output', (event) => {
  if (!terminal) return;
  terminal.write(event.payload);

  if (completionMarker) {
    markerBuffer += event.payload;
    if (markerBuffer.includes(completionMarker)) {
      markerBuffer = '';
      onExit?.();
    }
    // Keep buffer from growing unbounded — only need last N chars
    if (markerBuffer.length > 200) {
      markerBuffer = markerBuffer.slice(-100);
    }
  }
});
```

### 5. Remove Old Subprocess Import from AIWorkingScreen

Remove or comment out these imports (they're no longer needed for the primary flow):
```typescript
// import { sendPrompt, onOutput, interrupt, getSessionState } from '../claude/subprocess';
// import { parseClaudeEvent, extractCost, extractScope, extractRunningCost } from '../claude/streamParser';
```

Keep `getSessionState` if you still need session ID for resume. But consider: with a real terminal, session resume works naturally because the PTY shell persists.

### 6. Interrupt Handler — Send Ctrl+C

The current `handleInterrupt` calls `interrupt()` which kills the child process. With the PTY, send Ctrl+C instead:

```typescript
function handleInterrupt() {
  // Send Ctrl+C to the PTY (ASCII 0x03)
  invoke('pty_write', { data: '\x03' }).catch(console.error);
  navigate('level1');
}
```

This is more graceful — Claude Code handles SIGINT and cleans up properly.

### 7. TerminalPanel on Other Screens

Currently `TerminalPanel` appears on L1, L2, L3, and other screens showing boot messages / idle state. On those screens, the Terminal tab will show the persistent bash shell (which is fine — it's idle, waiting for a command). The "Structured" tab content (boot messages like "Awaiting category selection") can be written to the terminal itself:

```typescript
// Instead of entries.addEntry({ type: 'cursor', message: 'Awaiting category selection...' })
// Write directly to the PTY:
invoke('pty_write', { data: 'echo "Awaiting category selection..."\n' });
```

Or better yet: just let the terminal show the bash prompt. Users will understand they're looking at a terminal. Don't overthink boot messages.

### 8. Don't Clear Terminal on Screen Transition

Currently `AIWorkingScreen` calls `entries.clear()` on mount to reset the parsed view. With the real terminal, **do not clear it**. The terminal state persists. Users should be able to scroll back through their session history. This is natural terminal behavior.

### 9. Auto-Fix Flow

The auto-fix system in `AIWorkingScreen` currently uses `sendPrompt()` for retry attempts. This should also go through the PTY:

```typescript
function fireClaude(prompt: string) {
  // ... same command building as above ...
  // The PTY is already running bash, so just write another claude command
  terminalPanel?.getTerminal()?.writeCommand(fullCommand);
}
```

The auto-fix restart-and-watch logic (`autoFixRestartAndWatch`) doesn't touch Claude Code, so it stays the same.

### 10. Gamepad → Terminal Input: Focus Mode

**This is critical.** The user is on a Steam Deck with a gamepad. When Claude Code is running, it may ask permission prompts ("Allow this action? y/n") or present option selections (arrow keys to choose, Enter to confirm). The user needs to interact with these using the gamepad.

#### New Concept: Terminal Focus Mode

Add a new store in `src/lib/stores/terminal.ts`:

```typescript
export const terminalFocused = writable(false);
```

When `terminalFocused` is `true`, gamepad buttons route to the PTY as terminal keystrokes instead of DeckForge card navigation.

#### SELECT Button → Focus Toggle

Currently SELECT is a global handler in `inputRouter.ts` that toggles terminal tabs (claude ↔ app). **Repurpose it** to toggle terminal focus mode:

**In `inputRouter.ts`, replace the global SELECT handler:**

```typescript
SELECT: () => {
  import('../stores/terminal').then(({ terminalFocused }) => {
    const current = get(terminalFocused);
    terminalFocused.set(!current);
    devLog('input', `Global SELECT → terminal focus ${!current ? 'ON' : 'OFF'}`);
  });
}
```

#### Input Router: Terminal Focus Priority

Add a **new priority level** in `handleInput()` — between "START menu" (priority 2) and "screen-specific handlers" (priority 4). When terminal focus is active, intercept gamepad buttons and route them to the PTY:

```typescript
// Priority 2.5: Terminal focus mode — route gamepad to PTY
if (get(terminalFocused)) {
  const terminalHandled = handleTerminalInput(button);
  if (terminalHandled) return;
}
```

**Create `handleTerminalInput()` in `inputRouter.ts`:**

```typescript
function handleTerminalInput(button: string): boolean {
  const { invoke } = await import('@tauri-apps/api/core');

  const keyMap: Record<string, string> = {
    'DPAD_UP':    '\x1b[A',     // Arrow Up (ANSI escape)
    'DPAD_DOWN':  '\x1b[B',     // Arrow Down
    'DPAD_LEFT':  '\x1b[D',     // Arrow Left
    'DPAD_RIGHT': '\x1b[C',     // Arrow Right
    'A':          '\r',          // Enter (confirm/select)
    'Y':          'y',           // Accept (permission prompts — Y is always "yes/accept" in DeckForge)
    'X':          'n',           // Decline (permission prompts — X is reject/alt in DeckForge)
    'B':          '\x1b',        // Escape — safe "back out" without typing a destructive 'n'
    'LB':         '\x1b[5~',    // Page Up (scroll up in terminal)
    'RB':         '\x1b[6~',    // Page Down (scroll down in terminal)
  };

  const data = keyMap[button];
  if (!data) return false; // Let unrecognized buttons fall through to normal handling

  invoke('pty_write', { data }).catch(console.error);
  return true;
}
```

**Important: B button behavior.** In terminal focus mode, B sends Escape (`\x1b`) to the terminal — this cancels/dismisses in most terminal contexts without making a destructive choice. This avoids the problem of users instinctively pressing B (thinking "go back") and accidentally declining a permission prompt. If the user wants to explicitly type "n", they can use X (which is the "reject/cancel" button in DeckForge's design language). Update the keyMap:

```typescript
'B':          '\x1b',        // Escape — safe "back out" that doesn't type 'n'
'X':          'n',           // Explicit decline (X = reject in DeckForge design)
```

This way B is always a safe "I didn't mean to" button regardless of focus mode. X is the deliberate "no" — which matches DeckForge's existing pattern where X is the modifier/alternate action.

**Exception: START button.** START should ALWAYS open the DeckForge menu, even in terminal focus mode. The existing priority cascade already handles this (START menu is priority 2, terminal focus would be 2.5). No change needed.

#### Visual Indicator for Focus Mode

The user needs to know when gamepad input is going to the terminal vs. the palette. Add a visual indicator to the terminal header:

```svelte
{#if $terminalFocused}
  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-primary/20 text-primary border-primary/30 animate-pulse">
    GAMEPAD → TERMINAL
  </span>
{/if}
```

And update the TerminalPanel border to glow when focused:

```svelte
<section class="flex flex-col min-w-0 border-r border-surface-border bg-background-dark relative shrink-0
  {$terminalFocused ? 'ring-1 ring-primary/50' : ''}
  {terminalGlitching ? 'terminal-error-glitch' : ''}"
  style="width: {$splitRatio}%">
```

#### Update Hint Grid in AIWorkingScreen

Update the hint grids to reflect SELECT's new meaning and the terminal focus controls:

```svelte
{:else}
  <HintGrid hints={[
    { key: 'B', label: 'Interrupt' },
    { key: 'SELECT', label: $terminalFocused ? 'Unfocus Terminal' : 'Focus Terminal' },
    { key: 'START', label: 'Menu' },
    { key: 'LB+RB', label: 'Voice' },
  ]} />
{/if}
```

Also add a hint when focused that shows the terminal controls:

When `$terminalFocused` is true, the hint grid on the AI Working screen should show terminal-relevant hints:

```svelte
{#if $terminalFocused}
  <HintGrid hints={[
    { key: 'D-PAD', label: 'Navigate' },
    { key: 'A', label: 'Confirm' },
    { key: 'Y', label: 'Accept (y)' },
    { key: 'X', label: 'Decline (n)' },
    { key: 'SELECT', label: 'Unfocus' },
  ]} />
{/if}
```

#### Auto-Focus When Claude Asks for Input

Optionally (nice-to-have, not required): auto-enable terminal focus when Claude Code outputs a permission prompt. The regex must be **tight** — "Allow" alone appears constantly in normal code output (CORS headers, config files, comments). Use Claude Code's specific prompt format:

```typescript
// In TerminalEmulator's pty-output listener:
// Only match Claude Code's actual permission prompt format, not random code containing "allow"
const PERMISSION_PROMPT_RE = /\(y\/n\)|Do you want to|approve this|permission to|Press Enter to continue/i;

if (PERMISSION_PROMPT_RE.test(event.payload)) {
  import('../stores/terminal').then(({ terminalFocused }) => {
    terminalFocused.set(true);
  });
}
```

**Warning:** Even this tighter regex could false-positive. If it proves unreliable during testing, remove auto-focus entirely and rely on the user pressing SELECT manually. A false auto-focus that hijacks gamepad input while the user is navigating cards is worse than requiring one extra button press. When in doubt, don't auto-focus.

#### Auto-Unfocus on Completion

When the completion marker (the OSC sequence) is detected, auto-disable terminal focus so the user's gamepad goes back to controlling the palette (where Continue/Back to Home cards appear). This happens inside the same listener that calls `onExit()`:

```typescript
// In the markerBuffer check (see Section 4 above):
if (markerBuffer.includes(completionMarker)) {
  markerBuffer = '';
  // Auto-unfocus so gamepad returns to palette for Continue/Back cards
  import('../stores/terminal').then(({ terminalFocused }) => {
    terminalFocused.set(false);
  });
  onExit?.();
}
```

## What NOT to Change

- **`subprocess.ts`** — Leave it in the codebase. Don't delete it. It may be useful later for headless/background operations.
- **`streamParser.ts`** — Same. Leave it.
- **`terminal.ts` stores** — Keep the store definitions. Just stop writing to them from the primary flow.
- **App Output tab** — Unchanged. App launching is a separate system.
- **The scanline overlay and glitch animations** — Keep these on the TerminalPanel container for visual flair during streaming.
- **R-stick Y-axis scrolling** — Keep this working for terminal scrolling even when NOT in focus mode. R-stick scroll should always work on the terminal panel regardless of focus state.
- **Gamepad polling / button detection** — No changes to `gamepad.ts`. Only `inputRouter.ts` changes.

## How to Verify

1. Navigate to L1 → you should see the Terminal tab with a bash shell prompt
2. Navigate to L2 → pick a suggestion → L3 → hit Ship It
3. The claude command should appear in the terminal and Claude Code should start running with its native UI (spinners, colored output, tool use indicators)
4. The only color difference should be cyan accents instead of orange
5. When Claude finishes, the action palette should show "Continue" and "Back to Home"
6. Press B (Interrupt) while Claude is working → should send Ctrl+C gracefully
7. Switch to App Output tab → should still work normally
8. Terminal scrollback should persist across screen transitions

## Testing

Run existing tests:
```bash
npm run test
npm run test:e2e
```

E2E tests that reference "Claude Code Stream" text will need updating to look for "Terminal" instead. Specifically:
- `screens-core.spec.ts` line 61: `await expectPageContains(page, 'Claude Code Stream');` → change to `'Terminal'`
- `screens-core.spec.ts` line 99: same change

## How to Verify (updated with gamepad)

1. Navigate to L1 → you should see the Terminal tab with a bash shell prompt
2. Press SELECT → terminal panel border should glow cyan, "GAMEPAD → TERMINAL" badge appears
3. Press D-pad → should send arrow keys to terminal (visible cursor movement in bash)
4. Press SELECT again → glow disappears, D-pad controls card navigation again
5. Navigate to L3 → hit Ship It → Claude starts running in terminal
6. If Claude asks a permission prompt → press SELECT to focus, Y to accept, A to confirm
7. When Claude finishes → focus auto-disables, Continue/Back to Home cards are gamepad-navigable
8. Press B (Interrupt) while in palette mode → sends Ctrl+C
9. Press B while in terminal focus mode → sends "n" to terminal

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| `src/lib/stores/terminal.ts` | Add `'terminal'` to TerminalTab type, add `terminalFocused` store, change default | New primary tab + focus mode tracking |
| `src/lib/components/TerminalPanel.svelte` | Restructure tabs, embed TerminalEmulator, remove cost/scope, add focus glow, add props | Real terminal as primary view |
| `src/lib/input/inputRouter.ts` | Add terminal focus priority level, `handleTerminalInput()`, repurpose SELECT handler | Route gamepad to PTY when focused |
| `src/lib/screens/AIWorkingScreen.svelte` | Replace subprocess calls with PTY command injection, new exit handler, Ctrl+C interrupt, update hint grids | Use real terminal instead of JSON pipe |
| `src/lib/components/TerminalEmulator.svelte` | Add auto-focus on permission prompts (optional), auto-unfocus on completion | Smooth gamepad UX |
| `e2e/screens-core.spec.ts` | Update "Claude Code Stream" references | Tab name changed |
