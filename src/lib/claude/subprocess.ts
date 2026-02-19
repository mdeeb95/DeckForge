import type { ClaudeEvent, SessionOptions, SessionState } from './types';
import { devLog, devError } from '../utils/devLog';
import { get } from 'svelte/store';
import { claudePath } from '../system/claudeResolver';

// ─── State ───────────────────────────────────────────────────────────────────

let state: SessionState = {
  sessionId: null,
  active: false,
  projectPath: '',
};

let outputCallback: ((event: ClaudeEvent) => void) | null = null;
let childProcess: ChildHandle | null = null;

// Lightweight handle wrapping the Tauri shell child process
interface ChildHandle {
  kill: () => Promise<void>;
  pid: number;
}

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Diagnostics (visible in terminal panel) ────────────────────────────────

function emitDiag(message: string): void {
  outputCallback?.({
    type: 'assistant',
    message: {
      id: `diag-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: `[DIAG] ${message}` }],
      model: 'diagnostic',
    },
    session_id: state.sessionId ?? 'pre-init',
  } as ClaudeEvent);
}

let gotResultEvent = false;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Register a callback for streaming Claude events.
 * Call before sendPrompt.
 */
export function onOutput(callback: (event: ClaudeEvent) => void): void {
  outputCallback = callback;
}

/**
 * Send a prompt to Claude Code. Spawns a new CLI process for each prompt.
 * Uses --resume when a session already exists.
 */
export async function sendPrompt(
  prompt: string,
  options: SessionOptions,
): Promise<void> {
  state.projectPath = options.projectPath;
  state.active = true;

  gotResultEvent = false;
  const tauriDetected = isTauri();
  devLog('claude', `isTauri() = ${tauriDetected}`);
  emitDiag(`isTauri() = ${tauriDetected}`);

  if (!tauriDetected) {
    emitDiag('Falling back to mock stream (not in Tauri)');
    await mockStream(prompt);
    return;
  }

  const args = buildClaudeArgs(prompt, options);
  devLog('claude', `Spawning claude with ${args.length} args`, args);
  devLog('claude', `cwd: ${options.projectPath}`);
  emitDiag(`Spawning: claude ${args.slice(0, 3).join(' ')} ... (${args.length} args total)`);
  emitDiag(`cwd: ${options.projectPath}`);

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    emitDiag('Tauri shell plugin imported OK');

    // Spawn through PTY wrapper to force line-buffered stdout.
    // - `unset CLAUDECODE CLAUDE_CODE` prevents nesting detection from blocking output
    // - `script` creates a pseudo-TTY so Node/claude flushes stdout per-line
    const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
    const isMac = navigator.platform === 'MacIntel' || navigator.platform.startsWith('Mac');

    // Use the resolved absolute path if available, otherwise fall back to bare 'claude'
    const resolvedPath = get(claudePath);
    const claudeBin = resolvedPath ? `'${resolvedPath}'` : 'claude';

    let shellCmd: string;
    if (isMac) {
      shellCmd = `unset CLAUDECODE CLAUDE_CODE; exec script -q /dev/null ${claudeBin} ${escapedArgs}`;
    } else {
      shellCmd = `unset CLAUDECODE CLAUDE_CODE; exec script -qfc "${claudeBin} ${escapedArgs}" /dev/null`;
    }

    emitDiag(`Shell command: ${shellCmd.slice(0, 120)}...`);

    const command = Command.create('sh', ['-c', shellCmd], {
      cwd: options.projectPath,
    });

    // Accumulate stdout chunks and split on newlines.
    // Tauri shell emits arbitrary OS-buffered chunks, NOT line-by-line.
    let stdoutBuffer = '';
    let gotAnyStdout = false;

    command.stdout.on('data', (chunk: string) => {
      gotAnyStdout = true;
      stdoutBuffer += chunk.replace(/\r/g, '');

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
          if (trimmed.startsWith('Script ') || trimmed.startsWith('Typescript ')) {
            devLog('claude', `[script banner] ${trimmed}`);
          } else {
            emitDiag(`[stdout non-JSON] (${trimmed.length} chars) ${trimmed.slice(0, 200)}`);
          }
        }
      }
    });

    command.stderr.on('data', (line: string) => {
      devError('claude', 'stderr', line);
      emitDiag(`[stderr] ${line.trim().slice(0, 200)}`);
    });

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
      state.active = false;
      childProcess = null;

      // Synthesize a result if we never got one
      if (!gotResultEvent) {
        outputCallback?.({
          type: 'result',
          result: data.code !== 0
            ? `Claude Code exited with code ${data.code}`
            : 'Claude Code exited without sending a result event.',
          session_id: state.sessionId ?? '',
          is_error: data.code !== 0,
          duration_ms: 0,
          duration_api_ms: 0,
          num_turns: 0,
        });
      }
    });

    command.on('error', (error: string) => {
      devError('claude', 'Process error', error);
      state.active = false;
      childProcess = null;
      outputCallback?.({
        type: 'result',
        result: `Claude Code error: ${error}`,
        session_id: state.sessionId ?? '',
        is_error: true,
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 0,
      });
    });

    const child = await command.spawn();
    devLog('claude', `Spawned — PID ${child.pid}`);
    emitDiag(`Spawned successfully — PID ${child.pid}`);
    childProcess = {
      kill: () => child.kill(),
      pid: child.pid,
    };

    // Diagnostic: warn if no stdout after 5 seconds
    setTimeout(() => {
      if (!gotAnyStdout && state.active) {
        emitDiag(`WARNING: No stdout received after 5s. Tauri may not be delivering pipe data.`);
        emitDiag(`Process is ${childProcess ? 'still running' : 'gone'}. Buffer: ${stdoutBuffer.length} chars`);
      }
    }, 5000);
  } catch (error) {
    state.active = false;
    devError('claude', 'Spawn failed', error);
    emitDiag(`SPAWN FAILED: ${error}`);
    outputCallback?.({
      type: 'result',
      result: `Failed to spawn Claude Code: ${error}`,
      session_id: '',
      is_error: true,
      duration_ms: 0,
      duration_api_ms: 0,
      num_turns: 0,
    });
  }
}

/**
 * Interrupt the running Claude Code process.
 */
export async function interrupt(): Promise<void> {
  if (childProcess) {
    await childProcess.kill();
    childProcess = null;
    state.active = false;
  }
}

/**
 * Get current session state.
 */
export function getSessionState(): SessionState {
  return { ...state };
}

/**
 * Reset session (for starting fresh without resume).
 */
export function resetSession(): void {
  state.sessionId = null;
  state.active = false;
}

// ─── Internals ───────────────────────────────────────────────────────────────

export function buildClaudeArgs(prompt: string, options: SessionOptions): string[] {
  const args: string[] = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
  ];

  // Resume existing session if we have a session ID
  const resumeId = options.sessionId ?? state.sessionId;
  if (resumeId) {
    args.push('--resume', '--session-id', resumeId);
  }

  // Permission mode
  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }

  // Allowed tools
  if (options.allowedTools.length > 0) {
    for (const tool of options.allowedTools) {
      args.push('--allowed-tools', tool);
    }
  }

  // System prompt append
  if (options.systemPromptAppend) {
    args.push('--append-system-prompt', options.systemPromptAppend);
  }

  if (!args.includes('--max-turns')) {
    args.push('--max-turns', '50');
  }

  return args;
}

// ─── Mock fallback for browser dev mode ──────────────────────────────────────

async function mockStream(prompt: string): Promise<void> {
  const mockSessionId = 'mock-session-' + Date.now();
  state.sessionId = mockSessionId;

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Simulate init
  outputCallback?.({
    type: 'system',
    subtype: 'init',
    session_id: mockSessionId,
    tools: ['Read', 'Write', 'Edit', 'Bash'],
  });

  await delay(500);

  // Simulate assistant thinking
  outputCallback?.({
    type: 'assistant',
    message: {
      id: 'msg-mock-1',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: `I'll implement this plan now. Let me start by reading the relevant files...`,
        },
      ],
      model: 'claude-sonnet-4-5-20250929',
    },
    session_id: mockSessionId,
  });

  await delay(1000);

  // Simulate tool use
  outputCallback?.({
    type: 'tool_use',
    tool_name: 'Read',
    tool_input: { file_path: 'src/App.tsx' },
    session_id: mockSessionId,
  });

  await delay(800);

  outputCallback?.({
    type: 'tool_result',
    tool_name: 'Read',
    output: '// App.tsx contents (42 lines)',
    is_error: false,
    session_id: mockSessionId,
  });

  await delay(600);

  outputCallback?.({
    type: 'assistant',
    message: {
      id: 'msg-mock-2',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Now I\'ll create the new component...',
        },
      ],
      model: 'claude-sonnet-4-5-20250929',
    },
    session_id: mockSessionId,
  });

  await delay(1200);

  outputCallback?.({
    type: 'tool_use',
    tool_name: 'Write',
    tool_input: {
      file_path: 'src/components/SearchBar.tsx',
      content: 'export function SearchBar() { ... }',
    },
    session_id: mockSessionId,
  });

  await delay(500);

  outputCallback?.({
    type: 'tool_result',
    tool_name: 'Write',
    output: 'File written successfully',
    is_error: false,
    session_id: mockSessionId,
  });

  await delay(1000);

  // Simulate completion
  outputCallback?.({
    type: 'result',
    result: 'Successfully implemented the search bar component with fuzzy matching.',
    session_id: mockSessionId,
    is_error: false,
    duration_ms: 5600,
    duration_api_ms: 4200,
    num_turns: 3,
    cost_usd: 0.032,
    total_cost_usd: 0.032,
  });

  state.active = false;
}
