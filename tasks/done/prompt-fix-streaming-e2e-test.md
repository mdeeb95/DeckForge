# Task: Fix Streaming Pipeline + E2E Test

## Problem
Claude Code spawns successfully in DeckForge (PID visible, DIAG messages show spawn), but **zero stdout events reach the UI**. The terminal panel stays on "Working..." forever. Meanwhile, running the exact same CLI command in a terminal works perfectly — events stream in ~2 seconds.

This means the issue is between Tauri's `Command.create()` stdout pipe and our `stdout.on('data')` handler. We need to diagnose and fix the issue, with tests to prevent regression.

## Known Facts
- `claude -p "say hello" --output-format stream-json --verbose` works instantly in terminal
- The spawned process IS running (confirmed via `ps aux`)
- The `--allowed-tools` flag fix is in place (kebab-case)
- The line buffer fix is in place (split on `\n`, accumulate partial chunks)
- No `[stdout non-JSON]` DIAG messages appear — meaning the `stdout.on('data')` handler never fires at all
- No `[stderr]` messages appear either
- The process doesn't crash — it just sits there producing output that Tauri never delivers

## Hypothesis
Tauri's `@tauri-apps/plugin-shell` `Command.create()` may require specific configuration to receive stdout in real-time, or there's a buffering issue between the OS pipe and Tauri's event system. Possible causes:

1. **Tauri shell plugin delivers stdout differently** — maybe it needs `encoding` option, or the `on('data')` event name is wrong for this version
2. **stdout is fully buffered** when not connected to a TTY — Claude Code (Node.js) may buffer its output when stdout is a pipe instead of a terminal
3. **The Tauri sidecar/command scope** may affect how output is captured
4. **Events arrive but the callback isn't connected** — timing issue between `onOutput()` registration and event delivery

## Step 1: Fix the smoke test

File: `src/test/integration/subprocess-smoke.test.ts`

The test currently checks for `--allowedTools` (camelCase) but the code was fixed to `--allowed-tools` (kebab-case). Update all assertions to match:
- Line 67-78: Change `--allowedTools` → `--allowed-tools` in the test
- Lines 72, 86, 123-124: Same

## Step 2: Add a buffer simulation test

Create a new test that validates the line buffer logic handles all chunking scenarios. This tests the exact code path in subprocess.ts without needing Tauri.

File: `src/test/integration/stdout-buffer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

/**
 * Simulate the exact buffering logic from subprocess.ts.
 * This validates that chunked stdout data (as Tauri delivers it)
 * is correctly reassembled into complete JSON events.
 */

// Replicate the buffer logic from subprocess.ts
function processChunks(chunks: string[]): { parsed: any[]; nonJson: string[]; remainder: string } {
  let stdoutBuffer = '';
  const parsed: any[] = [];
  const nonJson: string[] = [];

  for (const chunk of chunks) {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        parsed.push(JSON.parse(trimmed));
      } catch {
        nonJson.push(trimmed);
      }
    }
  }

  return { parsed, nonJson, remainder: stdoutBuffer };
}

// Real Claude Code event shapes for testing
const INIT_EVENT = JSON.stringify({type:"system",subtype:"init",session_id:"test-123",tools:["Read","Write"]});
const ASSISTANT_EVENT = JSON.stringify({type:"assistant",message:{id:"msg-1",type:"message",role:"assistant",content:[{type:"text",text:"Hello"}],model:"claude-sonnet"},"session_id":"test-123"});
const RESULT_EVENT = JSON.stringify({type:"result",result:"Done",session_id:"test-123",is_error:false,duration_ms:1000,duration_api_ms:800,num_turns:1,cost_usd:0.01,total_cost_usd:0.01});

describe('stdout buffer logic', () => {
  it('handles one event per chunk (ideal case)', () => {
    const result = processChunks([
      INIT_EVENT + '\n',
      ASSISTANT_EVENT + '\n',
      RESULT_EVENT + '\n',
    ]);
    expect(result.parsed).toHaveLength(3);
    expect(result.parsed[0].type).toBe('system');
    expect(result.parsed[1].type).toBe('assistant');
    expect(result.parsed[2].type).toBe('result');
    expect(result.remainder).toBe('');
  });

  it('handles multiple events in one chunk', () => {
    const combined = INIT_EVENT + '\n' + ASSISTANT_EVENT + '\n' + RESULT_EVENT + '\n';
    const result = processChunks([combined]);
    expect(result.parsed).toHaveLength(3);
  });

  it('handles event split across two chunks', () => {
    const half1 = INIT_EVENT.slice(0, 50);
    const half2 = INIT_EVENT.slice(50) + '\n';
    const result = processChunks([half1, half2]);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0].type).toBe('system');
  });

  it('handles event split across three chunks', () => {
    const third1 = INIT_EVENT.slice(0, 30);
    const third2 = INIT_EVENT.slice(30, 60);
    const third3 = INIT_EVENT.slice(60) + '\n';
    const result = processChunks([third1, third2, third3]);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0].type).toBe('system');
  });

  it('handles chunk boundary at newline', () => {
    const result = processChunks([
      INIT_EVENT + '\n' + ASSISTANT_EVENT.slice(0, 20),
      ASSISTANT_EVENT.slice(20) + '\n',
    ]);
    expect(result.parsed).toHaveLength(2);
  });

  it('handles empty chunks', () => {
    const result = processChunks(['', INIT_EVENT + '\n', '', '']);
    expect(result.parsed).toHaveLength(1);
  });

  it('handles trailing data without newline (buffered until close)', () => {
    const result = processChunks([INIT_EVENT + '\n', RESULT_EVENT]);
    expect(result.parsed).toHaveLength(1); // only INIT parsed
    expect(result.remainder).toBe(RESULT_EVENT); // RESULT waiting in buffer
  });

  it('handles non-JSON lines mixed in', () => {
    const result = processChunks([
      'Claude Code v2.1.44\n',
      INIT_EVENT + '\n',
      'Some warning text\n',
      RESULT_EVENT + '\n',
    ]);
    expect(result.parsed).toHaveLength(2);
    expect(result.nonJson).toHaveLength(2); // banner + warning
  });

  it('handles very large events (>4KB, typical init event)', () => {
    const bigTools = Array.from({length: 100}, (_, i) => `Tool${i}`);
    const bigEvent = JSON.stringify({type:"system",subtype:"init",session_id:"test",tools:bigTools});
    // Simulate OS delivering this in 1KB chunks
    const chunkSize = 1024;
    const chunks: string[] = [];
    for (let i = 0; i < bigEvent.length; i += chunkSize) {
      chunks.push(bigEvent.slice(i, i + chunkSize));
    }
    chunks[chunks.length - 1] += '\n'; // newline at end
    const result = processChunks(chunks);
    expect(result.parsed).toHaveLength(1);
    expect(result.parsed[0].tools).toHaveLength(100);
  });
});
```

## Step 3: Add a Tauri stdout delivery diagnostic

In `subprocess.ts`, we need to know if `stdout.on('data')` EVER fires. Add a timeout-based diagnostic that fires if no stdout data arrives within 5 seconds of spawning:

```typescript
// After command.spawn() succeeds:
const child = await command.spawn();
devLog('claude', `Spawned — PID ${child.pid}`);
emitDiag(`Spawned successfully — PID ${child.pid}`);

// Diagnostic: warn if no stdout after 5 seconds
let gotAnyStdout = false;
// Set flag at the top of stdout.on('data'):
// gotAnyStdout = true;  (add this as the first line in the handler)

setTimeout(() => {
  if (!gotAnyStdout && state.active) {
    emitDiag(`⚠ WARNING: No stdout received after 5s. Tauri may not be delivering pipe data.`);
    emitDiag(`⚠ Process is ${childProcess ? 'still running' : 'gone'}. Buffer: ${stdoutBuffer.length} chars`);
    // Try an alternative approach: read from the process using Tauri's fs
    // or check if the process is alive
  }
}, 5000);
```

Add `gotAnyStdout = true;` as the first line of the `stdout.on('data')` handler.

## Step 4: Investigate Tauri shell plugin encoding

Check the Tauri 2 `@tauri-apps/plugin-shell` documentation for `Command.create()`. Specifically:
- Does it need an `encoding` option? Try `Command.create('claude', args, { cwd, encoding: 'utf-8' })`
- Does the stdout event use a different event name in this version?
- Is there a known issue with stdout buffering for long-running processes?

Check the installed version: look at `package.json` for `@tauri-apps/plugin-shell` version, then check its source code in `node_modules/@tauri-apps/plugin-shell` for how `Command` handles stdout.

## Step 5: Try spawning through a shell wrapper

If the diagnostic confirms stdout never fires, try spawning through `sh -c` as a workaround. This adds a shell layer that may help with pipe buffering:

In `subprocess.ts`, change:
```typescript
const command = Command.create('claude', args, { cwd: options.projectPath });
```

To:
```typescript
// Spawn through shell to ensure proper stdout delivery
const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
const command = Command.create('sh', ['-c', `claude ${escapedArgs}`], { cwd: options.projectPath });
```

Note: `sh` must be in the `shell:allow-execute` scope in `src-tauri/capabilities/default.json` (it already is).

If that works, we know the issue is Tauri's direct process stdout capture vs shell-mediated capture.

## Step 6: Run the tests

```bash
# Run the buffer logic tests (should all pass)
npm run test:integration -- --grep "stdout buffer"

# Run the smoke test (should pass with --allowed-tools fix)
npm run test:integration -- --grep "buildClaudeArgs"

# Run the full integration suite (spawns real claude)
npm run test:integration
```

## Acceptance Criteria

- [ ] `subprocess-smoke.test.ts` passes with `--allowed-tools` (not `--allowedTools`)
- [ ] `stdout-buffer.test.ts` passes all chunking scenarios
- [ ] A 5-second diagnostic warning appears in the terminal panel if no stdout arrives
- [ ] Root cause identified: either Tauri stdout delivery or pipe buffering
- [ ] Fix applied: either encoding option, shell wrapper, or other solution
- [ ] After fix: Claude Code events stream into the terminal panel in real-time
- [ ] Existing integration tests still pass
