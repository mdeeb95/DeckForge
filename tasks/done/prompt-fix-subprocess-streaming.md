# Task: Fix Claude Code Subprocess Streaming + CLI Args

## Problem
Claude Code spawns successfully (PID visible, DIAG messages appear) but then **nothing happens**. No tool_use events, no assistant messages, no cost updates, no completion. The UI sits on "Working..." forever with "$0.00" cost.

Root cause: **three bugs working together**.

## Bug 1: Line Buffering (Critical)

**File:** `src/lib/claude/subprocess.ts`, line 92

**The Problem:**
```typescript
// Line-buffered stdout — each line is one JSON event   ← THIS COMMENT IS WRONG
command.stdout.on('data', (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const event = JSON.parse(trimmed) as ClaudeEvent;
```

Tauri's `stdout.on('data')` does NOT emit line-by-line. It emits arbitrary OS-buffered chunks. A single `data` callback might receive:
- Half of a JSON event (incomplete — `JSON.parse` throws)
- Multiple JSON events concatenated (only first one would parse, rest lost)
- A complete event split across two callbacks (both halves fail to parse)

Every failed parse gets logged as `[stdout non-JSON]` and silently discarded. This means **most or all events from Claude Code are being dropped**.

**The Fix — add a line buffer:**

Replace the `stdout.on('data')` handler (lines 91-111) with:

```typescript
// Accumulate stdout chunks and split on newlines.
// Tauri shell emits arbitrary OS-buffered chunks, NOT line-by-line.
let stdoutBuffer = '';

command.stdout.on('data', (chunk: string) => {
  stdoutBuffer += chunk;

  // Split on newlines — each complete line is one JSON event
  const lines = stdoutBuffer.split('\n');
  // Keep the last element (may be incomplete)
  stdoutBuffer = lines.pop() ?? '';

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed) as ClaudeEvent;

      // Capture session ID from init event
      if (event.type === 'system' && event.subtype === 'init') {
        state.sessionId = event.session_id;
      }

      if (event.type === 'result') gotResultEvent = true;
      devLog('claude', `stdout event: ${event.type}`, event.type === 'result' ? event : undefined);
      outputCallback?.(event);
    } catch {
      // Non-JSON line — show it instead of silently dropping
      emitDiag(`[stdout non-JSON] ${trimmed.slice(0, 200)}`);
    }
  }
});
```

**Key changes:**
- `stdoutBuffer` accumulates all incoming data
- `.split('\n')` breaks it into complete lines
- `.pop()` keeps the last (potentially incomplete) segment in the buffer
- Each complete line is parsed individually
- Claude Code's `--output-format stream-json` emits exactly one JSON object per line, so this is correct

**Also: flush the buffer on process close.** In the `command.on('close')` handler, add before the `gotResultEvent` check:

```typescript
command.on('close', (data: { code: number | null }) => {
  // Flush any remaining buffer
  if (stdoutBuffer.trim()) {
    try {
      const event = JSON.parse(stdoutBuffer.trim()) as ClaudeEvent;
      if (event.type === 'result') gotResultEvent = true;
      outputCallback?.(event);
    } catch {
      emitDiag(`[stdout buffer remainder] ${stdoutBuffer.trim().slice(0, 200)}`);
    }
    stdoutBuffer = '';
  }

  emitDiag(`Process closed with code ${data.code}`);
  // ... rest of existing close handler
```

## Bug 2: Wrong CLI Flag Name

**File:** `src/lib/claude/subprocess.ts`, line 226

**The Problem:**
```typescript
args.push('--allowedTools', tool);  // camelCase — WRONG
```

Claude Code CLI uses kebab-case flags. The correct flag is `--allowed-tools`.

**The Fix:**
```typescript
args.push('--allowed-tools', tool);
```

**Verify:** Run `claude --help` in a terminal. The flag listing will show `--allowed-tools`, not `--allowedTools`. If the CLI doesn't recognize `--allowedTools`, it may silently ignore it or error out — either way, Claude Code runs without tool restrictions which could cause unexpected behavior.

## Bug 3: Diagnostic Improvement

Currently when events fail to parse, the DIAG message truncates to 200 chars. For debugging, also log the total buffer size so we can tell if it's a chunking issue:

In the catch block:
```typescript
emitDiag(`[stdout non-JSON] (${trimmed.length} chars) ${trimmed.slice(0, 200)}`);
```

## Files to Modify

Only ONE file: `src/lib/claude/subprocess.ts`

### Changes Summary:
1. **Lines 91-111**: Replace `stdout.on('data')` handler with buffered version
2. **Lines 118-136**: Add buffer flush at the start of `command.on('close')` handler
3. **Line 226**: Change `--allowedTools` to `--allowed-tools`
4. **Line 109**: Add buffer length to non-JSON diagnostic

## Testing

After this fix:
1. Start DeckForge, navigate to L3, press Ship It
2. The terminal panel should now show Claude Code's streaming output in real-time:
   - `CLAUDE` assistant messages
   - `TOOL` Read/Write/Edit calls
   - File contents and diffs
3. Cost should update from $0.00 as tokens are consumed
4. Session should complete with checkmark and "Task Complete"
5. Langfuse session report should fire with actual cost/token/tool data

## Acceptance Criteria

- [ ] Claude Code events stream into the terminal panel in real-time (not stuck on "Working...")
- [ ] Cost updates as the session progresses
- [ ] Session completes with success/failure indicator
- [ ] The `--allowed-tools` flag is correctly formatted (kebab-case)
- [ ] Partial JSON chunks don't cause silent event loss
- [ ] Buffer is flushed on process close (no lost final events)
- [ ] Non-JSON diagnostic shows chunk length for debugging
