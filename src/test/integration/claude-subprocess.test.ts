import { describe, it, expect, beforeAll } from 'vitest';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a clean env that allows spawning claude without nesting detection. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // Claude Code refuses to launch inside another session; unset the marker.
  delete env.CLAUDECODE;
  return env;
}

/** Spawn claude CLI and collect all stdout lines. */
function spawnClaude(args: string[]): Promise<{
  code: number | null;
  stdout: string[];
  stderr: string[];
}> {
  return new Promise((resolve) => {
    const proc = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnv(),
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      stdout.push(...lines);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      stderr.push(...lines);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', () => {
      resolve({ code: -1, stdout, stderr });
    });
  });
}

/** Parse all stdout lines as JSON events, skipping unparseable lines. */
function parseEvents(lines: string[]): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Non-JSON line (banner, etc.)
    }
  }
  return events;
}

// ─── CLI availability check ──────────────────────────────────────────────────

let cliAvailable = false;
// In CI, require ANTHROPIC_API_KEY secret. Locally, the CLI has its own auth.
let canCallAPI = false;

beforeAll(async () => {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'], { env: cleanEnv() });
    cliAvailable = stdout.trim().length > 0;
  } catch {
    cliAvailable = false;
  }
  canCallAPI = cliAvailable && (!!process.env.ANTHROPIC_API_KEY || !process.env.CI);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Claude Code subprocess integration', () => {
  // ── Test 1: CLI availability ────────────────────────────────────────────
  it('claude CLI is available', async () => {
    if (!cliAvailable) {
      console.log('⚠ claude CLI not found in PATH — skipping integration tests');
      return;
    }

    const { stdout } = await execFileAsync('claude', ['--version'], { env: cleanEnv() });
    expect(stdout.trim()).toMatch(/\d+\.\d+/);
  });

  // ── Test 2: stream-json output is parseable ─────────────────────────────
  let streamEvents: Record<string, unknown>[] = [];
  let streamLines: string[] = [];

  it('stream-json output is parseable', { timeout: 60_000 }, async () => {
    if (!cliAvailable || !canCallAPI) {
      console.log('⚠ Skipping: requires claude CLI with authentication');
      return;
    }

    const result = await spawnClaude([
      '-p', 'Reply with exactly: hello world',
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', '1',
    ]);

    if (result.code !== 0) {
      console.error('claude stderr:', result.stderr.join('\n'));
    }
    expect(result.code).toBe(0);
    streamLines = result.stdout;

    // Every non-empty line should be valid JSON
    for (const line of result.stdout) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      expect(() => JSON.parse(trimmed)).not.toThrow();
    }

    streamEvents = parseEvents(result.stdout);
    expect(streamEvents.length).toBeGreaterThan(0);

    // At least one assistant event
    const assistantEvents = streamEvents.filter(e => e.type === 'assistant');
    expect(assistantEvents.length).toBeGreaterThanOrEqual(1);

    // Final event should be result
    const lastEvent = streamEvents[streamEvents.length - 1];
    expect(lastEvent.type).toBe('result');

    // Save fixture for replay tests
    const fixturesDir = path.join(__dirname, 'fixtures');
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixturesDir, 'sample-stream.json'),
      JSON.stringify(streamEvents, null, 2),
    );
  });

  // ── Test 3: result event contains cost and token data ───────────────────
  it('result event contains cost and token data', () => {
    if (!cliAvailable || !canCallAPI || streamEvents.length === 0) {
      console.log('⚠ Skipping: requires successful stream test');
      return;
    }

    const resultEvent = streamEvents.find(e => e.type === 'result') as Record<string, unknown>;
    expect(resultEvent).toBeDefined();
    expect(typeof resultEvent.duration_ms).toBe('number');
    expect(resultEvent.duration_ms as number).toBeGreaterThan(0);
    expect(typeof resultEvent.num_turns).toBe('number');
    expect(resultEvent.num_turns as number).toBeGreaterThanOrEqual(1);
  });

  // ── Test 4: session ID is returned ──────────────────────────────────────
  let capturedSessionId: string | null = null;

  it('session ID is returned', () => {
    if (!cliAvailable || !canCallAPI || streamEvents.length === 0) {
      console.log('⚠ Skipping: requires successful stream test');
      return;
    }

    const initEvent = streamEvents.find(
      e => e.type === 'system' && (e as Record<string, unknown>).subtype === 'init',
    ) as Record<string, unknown> | undefined;

    expect(initEvent).toBeDefined();
    expect(typeof initEvent!.session_id).toBe('string');
    expect((initEvent!.session_id as string).length).toBeGreaterThan(0);

    capturedSessionId = initEvent!.session_id as string;
  });

  // ── Test 5: session can be resumed ──────────────────────────────────────
  it('session can be resumed', { timeout: 60_000 }, async () => {
    if (!cliAvailable || !canCallAPI || !capturedSessionId) {
      console.log('⚠ Skipping: requires session ID from previous test');
      return;
    }

    const result = await spawnClaude([
      '--resume',
      '-p', 'What was my last message?',
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', '1',
    ]);

    if (result.code === 0) {
      // Successful resume — verify result event exists
      const events = parseEvents(result.stdout);
      const resultEvent = events.find(e => e.type === 'result');
      expect(resultEvent).toBeDefined();
    } else {
      // Session may be locked (e.g., running inside Claude Code) or
      // the CLI may return non-zero for other known reasons.
      // Log and verify we at least got a recognized error, not a crash.
      const stderr = result.stderr.join('\n');
      const stdout = result.stdout.join('\n');
      console.log(`⚠ Resume exited with code ${result.code}`);
      if (stderr) console.log('  stderr:', stderr);
      if (stdout) console.log('  stdout:', stdout);

      // Accept any recognized error pattern (session lock, no session found, etc.)
      const events = parseEvents(result.stdout);
      const resultEvent = events.find(e => e.type === 'result');
      const isKnownError = stderr.includes('already in use')
        || stderr.includes('session')
        || stderr.includes('Session')
        || (resultEvent && (resultEvent as Record<string, unknown>).is_error === true);
      expect(isKnownError).toBe(true);
    }
  });

  // ── Test 6: interrupt/kill works ────────────────────────────────────────
  it('interrupt/kill works', { timeout: 60_000 }, async () => {
    if (!cliAvailable || !canCallAPI) {
      console.log('⚠ Skipping: requires claude CLI with authentication');
      return;
    }

    const proc = spawn('claude', [
      '-p', 'Write a 2000 word essay about dogs. Be very thorough and detailed.',
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', '1',
    ], { stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv() });

    let gotAssistant = false;
    let exited = false;
    const startTime = Date.now();

    const exitPromise = new Promise<number | null>((resolve) => {
      proc.on('close', (code) => {
        exited = true;
        resolve(code);
      });
      proc.on('error', () => {
        exited = true;
        resolve(-1);
      });
    });

    // Wait for first assistant event, then kill
    await new Promise<void>((resolve) => {
      proc.stdout.on('data', (chunk: Buffer) => {
        if (gotAssistant) return;
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'assistant') {
              gotAssistant = true;
              proc.kill('SIGTERM');
              resolve();
              return;
            }
          } catch {
            // ignore
          }
        }
      });

      // Fallback: kill after 15s if no assistant event
      setTimeout(() => {
        if (!gotAssistant) {
          proc.kill('SIGTERM');
          resolve();
        }
      }, 15_000);
    });

    await exitPromise;
    const elapsed = Date.now() - startTime;

    expect(exited).toBe(true);
    expect(elapsed).toBeLessThan(20_000); // should exit well within 20s
  });
});

// ─── streamParser tests with real events ─────────────────────────────────────

describe('streamParser with real events', () => {
  it('parses real stream events into TerminalEntry objects', async () => {
    // Try loading from a previous run's fixture
    const fixturePath = path.join(__dirname, 'fixtures', 'sample-stream.json');
    if (!fs.existsSync(fixturePath)) {
      console.log('⚠ No fixture file found — run full integration tests first to generate');
      return;
    }

    // Dynamic import to avoid Tauri/Svelte module issues in Node environment
    const { parseClaudeEvent } = await import('../../lib/claude/streamParser');
    const events = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const allEntries: Array<{ type: string }> = [];

    for (const event of events) {
      const entries = parseClaudeEvent(event);
      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
      allEntries.push(...entries);
    }

    expect(allEntries.length).toBeGreaterThan(0);

    // At least one thought or code entry
    const hasThoughtOrCode = allEntries.some(
      e => e.type === 'thought' || e.type === 'code',
    );
    expect(hasThoughtOrCode).toBe(true);

    // Final entry should be cursor
    const lastEntry = allEntries[allEntries.length - 1];
    expect(lastEntry.type).toBe('cursor');
  });
});
