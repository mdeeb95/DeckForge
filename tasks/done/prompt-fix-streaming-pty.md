# Task: Fix Claude Code Stdout — PTY Wrapper + Env Cleanup

## Root Cause Analysis

Echo test through Tauri shell plugin works perfectly:
```
[DIAG] [echo test] stdout received: "TAURI_STDOUT_TEST"
```

But `claude` CLI produces ZERO stdout through the same pipe, despite process spawning successfully (PID confirmed alive, 128MB RAM, verified with `ps aux`).

**Two confirmed issues:**

### Issue 1: CLAUDECODE Nesting Detection
When DeckForge runs via `npm run tauri dev` inside a Claude Code session (or any environment with `CLAUDECODE=1` set), the child `claude` process inherits `CLAUDECODE=1`. Claude Code detects this and may refuse to run normally or suppress output. The test file `claude-subprocess.test.ts` already handles this by calling `delete env.CLAUDECODE` — but `subprocess.ts` does not.

### Issue 2: TTY Buffering
Node.js (which powers Claude Code) uses full buffering when stdout is a pipe (not a TTY). With `--output-format stream-json`, output may be buffered internally and never flushed until the process exits. The `sh -c` wrapper doesn't fix this because the pipe from sh→Tauri is still not a TTY.

**Fix:** Wrap the `claude` command in `script` which creates a pseudo-TTY, making Claude Code think stdout is a terminal. This forces line-buffered/immediate output.

## Changes Required

### File: `src/lib/claude/subprocess.ts`

#### 1. Remove the echo diagnostic test

Delete the entire block between `// ── Diagnostic: test if Tauri shell delivers ANY stdout ──` and `// ── End diagnostic ──` (approximately lines 87-104). It served its purpose — we confirmed Tauri works.

#### 2. Replace the spawn command with PTY wrapper + env cleanup

**Find this block** (the current sh -c wrapper):
```typescript
// Spawn through shell to ensure proper stdout delivery.
// Direct Tauri → claude pipe can buffer/stall; sh -c mediates reliably.
const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
const command = Command.create('sh', ['-c', `claude ${escapedArgs}`], {
  cwd: options.projectPath,
});
```

**Replace with:**
```typescript
// Build shell-safe arg string
const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');

// Determine platform for correct `script` syntax.
// `script` creates a pseudo-TTY so Claude Code streams to stdout immediately
// instead of fully buffering (Node.js full-buffers pipes, line-buffers TTYs).
// Also unset CLAUDECODE to prevent nesting-detection from blocking output.
const isMac = navigator.platform === 'MacIntel' || navigator.platform.startsWith('Mac');

let shellCmd: string;
if (isMac) {
  // macOS script: script -q /dev/null command args...
  shellCmd = `unset CLAUDECODE CLAUDE_CODE; exec script -q /dev/null claude ${escapedArgs}`;
} else {
  // Linux script (util-linux): script -qfc 'command args...' /dev/null
  shellCmd = `unset CLAUDECODE CLAUDE_CODE; exec script -qfc "claude ${escapedArgs}" /dev/null`;
}

emitDiag(`Shell command: ${shellCmd.slice(0, 120)}...`);

const command = Command.create('sh', ['-c', shellCmd], {
  cwd: options.projectPath,
});
```

#### 3. Strip carriage returns from stdout

The `script` command emulates a terminal, which adds `\r` (carriage return) characters to output. These will break JSON parsing. In the `command.stdout.on('data', ...)` handler, strip `\r` from the chunk before processing.

**Find:**
```typescript
command.stdout.on('data', (chunk: string) => {
  gotAnyStdout = true;
  stdoutBuffer += chunk;
```

**Replace with:**
```typescript
command.stdout.on('data', (chunk: string) => {
  gotAnyStdout = true;
  // script(1) emulates a TTY which adds \r — strip them for clean JSON parsing
  stdoutBuffer += chunk.replace(/\r/g, '');
```

#### 4. Handle `script` banner lines

`script` may emit a "Script started" and "Script done" banner line even with `-q`. These are NOT JSON and should be silently ignored. The existing non-JSON handler already covers this (the `catch` block that calls `emitDiag`), but change it to be quieter for known script banners:

**Find:**
```typescript
} catch {
  // Non-JSON line — show it instead of silently dropping
  emitDiag(`[stdout non-JSON] (${trimmed.length} chars) ${trimmed.slice(0, 200)}`);
}
```

**Replace with:**
```typescript
} catch {
  // Non-JSON line — script(1) banners, etc.
  if (trimmed.startsWith('Script ') || trimmed.startsWith('Typescript ')) {
    // script(1) banner — ignore silently
    devLog('claude', `[script banner] ${trimmed}`);
  } else {
    emitDiag(`[stdout non-JSON] (${trimmed.length} chars) ${trimmed.slice(0, 200)}`);
  }
}
```

#### 5. Add `script` to Tauri shell allowlist (NOT NEEDED)

We spawn `script` through the already-allowed `sh` command, so no capability changes needed. The `sh -c` wrapper is already permitted.

### File: `src/lib/claude/subprocess.ts` — Optional: Add `--max-turns` safety limit

After building args in `buildClaudeArgs`, if no `--max-turns` is present, add a safety default:

```typescript
// Safety: ensure max-turns is set to prevent runaway sessions
if (!args.includes('--max-turns')) {
  args.push('--max-turns', '50');
}
```

Add this just before the `return args;` at the end of `buildClaudeArgs`.

## How to Verify

After making these changes, rebuild and launch DeckForge. Navigate to L3 → Ship It. In the developer console / terminal panel you should see:

1. `[DIAG] Shell command: unset CLAUDECODE CLAUDE_CODE; exec script -q /dev/null claude ...`
2. `[DIAG] Spawned successfully — PID XXXXX`
3. Within 1-2 seconds: `stdout event: system` (the init event)
4. Then `stdout event: assistant` events streaming in
5. The terminal panel should show Claude's thinking/code in real time
6. Eventually `stdout event: result` when complete

If it still doesn't work, the 5-second diagnostic warning will fire. In that case, check:
- Does the process still show as running in `ps aux | grep claude`?
- Is there stderr output in the dev console?
- Try running manually: `unset CLAUDECODE; script -q /dev/null claude -p "say hello" --output-format stream-json --verbose --max-turns 1`

## Testing the fix manually first

Before changing code, you can test the PTY approach in terminal:

```bash
# This should stream JSON events immediately:
unset CLAUDECODE; script -q /dev/null claude -p "say hello" --output-format stream-json --verbose --max-turns 1

# Compare with plain pipe (this may buffer):
unset CLAUDECODE; claude -p "say hello" --output-format stream-json --verbose --max-turns 1 | cat
```

If the `script` version streams but the `| cat` version buffers, that confirms TTY buffering is the issue.

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| subprocess.ts | Remove echo diagnostic | No longer needed |
| subprocess.ts | PTY wrapper via `script` | Forces Claude Code to line-buffer stdout |
| subprocess.ts | `unset CLAUDECODE CLAUDE_CODE` | Prevents nesting detection blocking output |
| subprocess.ts | Strip `\r` from stdout chunks | Clean up TTY carriage returns |
| subprocess.ts | Quiet script banner handling | Don't spam DIAG with "Script started" lines |
| subprocess.ts | Optional: `--max-turns 50` default | Safety limit |
