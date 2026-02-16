// ─── QA Test Runner — execute tests and parse results ────────────────────────

import type { ProjectConfig } from '../types/data';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  duration_ms: number;
  error?: string;
}

export interface TestRunResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
  raw_output: string;
  duration_ms: number;
  runner: string;
}

export type OutputCallback = (line: string) => void;

// ─── Tauri detection ────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run tests for the given project config. Streams output via onOutput callback.
 * Detects the test runner from package.json scripts or project type.
 */
export async function runTests(
  config: ProjectConfig,
  onOutput: OutputCallback,
): Promise<TestRunResult> {
  const cwd = config.run_config.working_directory || config.project.path;

  if (!isTauri()) {
    return mockRunTests(onOutput);
  }

  // Detect the test command
  const testCmd = await detectTestCommand(cwd);
  if (!testCmd) {
    onOutput('⚠ No test command found. Skipping tests.');
    return {
      total: 0, passed: 0, failed: 0, skipped: 0,
      tests: [], raw_output: 'No test command configured', duration_ms: 0, runner: 'none',
    };
  }

  onOutput(`→ Running: ${testCmd.command}`);
  const start = Date.now();

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const cmd = Command.create('sh', ['-c', testCmd.command], { cwd });

    let stdout = '';
    let stderr = '';

    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      cmd.stdout.on('data', (line: string) => {
        stdout += line + '\n';
        onOutput(line);
      });

      cmd.stderr.on('data', (line: string) => {
        stderr += line + '\n';
        onOutput(line);
      });

      cmd.on('close', (data: { code: number | null }) => {
        resolve({ stdout, stderr, code: data.code ?? 1 });
      });

      cmd.on('error', (error: string) => {
        reject(new Error(error));
      });

      cmd.spawn();
    });

    const duration = Date.now() - start;
    const fullOutput = stdout + stderr;

    return parseTestOutput(fullOutput, testCmd.runner, duration, result.code === 0);
  } catch (error) {
    const duration = Date.now() - start;
    onOutput(`✗ Test execution failed: ${error}`);
    return {
      total: 0, passed: 0, failed: 0, skipped: 0,
      tests: [], raw_output: String(error), duration_ms: duration, runner: testCmd.runner,
    };
  }
}

// ─── Test command detection ─────────────────────────────────────────────────

interface TestCommand {
  command: string;
  runner: string;
}

async function detectTestCommand(cwd: string): Promise<TestCommand | null> {
  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    const joinPath = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/');

    // Check package.json for npm test
    const pkgPath = joinPath(cwd, 'package.json');
    if (await exists(pkgPath)) {
      const pkg = JSON.parse(await readTextFile(pkgPath));
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        const testScript = pkg.scripts.test as string;
        const runner = detectRunner(testScript);
        return { command: 'npm test -- --reporter=verbose 2>&1 || npm test 2>&1', runner };
      }
    }

    // Check for Cargo.toml (Rust)
    if (await exists(joinPath(cwd, 'Cargo.toml'))) {
      return { command: 'cargo test 2>&1', runner: 'cargo' };
    }

    // Check for pytest
    if (await exists(joinPath(cwd, 'pytest.ini')) ||
        await exists(joinPath(cwd, 'pyproject.toml')) ||
        await exists(joinPath(cwd, 'setup.py'))) {
      return { command: 'python3 -m pytest -v 2>&1', runner: 'pytest' };
    }
  } catch (error) {
    console.error('[qaRunner] Test command detection failed:', error);
  }

  return null;
}

function detectRunner(testScript: string): string {
  if (testScript.includes('vitest')) return 'vitest';
  if (testScript.includes('jest')) return 'jest';
  if (testScript.includes('pytest')) return 'pytest';
  if (testScript.includes('mocha')) return 'mocha';
  return 'npm';
}

// ─── Test output parsing ────────────────────────────────────────────────────

function parseTestOutput(
  output: string,
  runner: string,
  duration_ms: number,
  exitSuccess: boolean,
): TestRunResult {
  switch (runner) {
    case 'vitest':
      return parseVitestOutput(output, duration_ms);
    case 'jest':
      return parseJestOutput(output, duration_ms);
    case 'pytest':
      return parsePytestOutput(output, duration_ms);
    case 'cargo':
      return parseCargoTestOutput(output, duration_ms);
    default:
      return parseGenericOutput(output, duration_ms, exitSuccess);
  }
}

function parseVitestOutput(output: string, duration_ms: number): TestRunResult {
  const tests: TestResult[] = [];

  // Match vitest test lines: ✓ test name (duration) or × test name
  const passPattern = /[✓✔]\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/gm;
  const failPattern = /[✗✕×]\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/gm;

  let match;
  while ((match = passPattern.exec(output)) !== null) {
    tests.push({ name: match[1].trim(), passed: true, duration_ms: parseInt(match[2] || '0', 10) });
  }
  while ((match = failPattern.exec(output)) !== null) {
    tests.push({ name: match[1].trim(), passed: false, duration_ms: parseInt(match[2] || '0', 10) });
  }

  // Parse summary line: Tests  X passed | Y failed | Z total
  const summaryMatch = output.match(/Tests\s+(\d+)\s+passed\s*(?:\|\s*(\d+)\s+failed)?\s*(?:\|\s*(\d+)\s+skipped)?\s*(?:\|\s*(\d+)\s+total)?/i);
  const passed = summaryMatch ? parseInt(summaryMatch[1], 10) : tests.filter(t => t.passed).length;
  const failed = summaryMatch && summaryMatch[2] ? parseInt(summaryMatch[2], 10) : tests.filter(t => !t.passed).length;
  const skipped = summaryMatch && summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0;
  const total = summaryMatch && summaryMatch[4] ? parseInt(summaryMatch[4], 10) : passed + failed + skipped;

  return { total, passed, failed, skipped, tests, raw_output: output, duration_ms, runner: 'vitest' };
}

function parseJestOutput(output: string, duration_ms: number): TestRunResult {
  const tests: TestResult[] = [];

  // Match jest test lines: ✓ test name (duration) or ✕ test name
  const passPattern = /[✓✔]\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/gm;
  const failPattern = /[✗✕×]\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/gm;

  let match;
  while ((match = passPattern.exec(output)) !== null) {
    tests.push({ name: match[1].trim(), passed: true, duration_ms: parseInt(match[2] || '0', 10) });
  }
  while ((match = failPattern.exec(output)) !== null) {
    tests.push({ name: match[1].trim(), passed: false, duration_ms: parseInt(match[2] || '0', 10) });
  }

  // Parse summary: Tests: X passed, Y failed, Z total
  const summaryMatch = output.match(/Tests:\s+(?:(\d+)\s+passed)?[,\s]*(?:(\d+)\s+failed)?[,\s]*(?:(\d+)\s+skipped)?[,\s]*(\d+)\s+total/i);
  const passed = summaryMatch && summaryMatch[1] ? parseInt(summaryMatch[1], 10) : tests.filter(t => t.passed).length;
  const failed = summaryMatch && summaryMatch[2] ? parseInt(summaryMatch[2], 10) : tests.filter(t => !t.passed).length;
  const skipped = summaryMatch && summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0;
  const total = summaryMatch && summaryMatch[4] ? parseInt(summaryMatch[4], 10) : passed + failed + skipped;

  return { total, passed, failed, skipped, tests, raw_output: output, duration_ms, runner: 'jest' };
}

function parsePytestOutput(output: string, duration_ms: number): TestRunResult {
  const tests: TestResult[] = [];

  // Match pytest lines: PASSED test::name or FAILED test::name
  const linePattern = /^(.*?)\s+(PASSED|FAILED|SKIPPED|ERROR)(?:\s+\[.*\])?\s*$/gm;
  let match;
  while ((match = linePattern.exec(output)) !== null) {
    tests.push({
      name: match[1].trim(),
      passed: match[2] === 'PASSED',
      duration_ms: 0,
    });
  }

  // Parse summary: X passed, Y failed, Z skipped in Ns
  const summaryMatch = output.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/);
  const passed = summaryMatch ? parseInt(summaryMatch[1], 10) : tests.filter(t => t.passed).length;
  const failed = summaryMatch && summaryMatch[2] ? parseInt(summaryMatch[2], 10) : tests.filter(t => !t.passed).length;
  const skipped = summaryMatch && summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0;
  const total = passed + failed + skipped;

  return { total, passed, failed, skipped, tests, raw_output: output, duration_ms, runner: 'pytest' };
}

function parseCargoTestOutput(output: string, duration_ms: number): TestRunResult {
  const tests: TestResult[] = [];

  // Match cargo test lines: test name ... ok or test name ... FAILED
  const linePattern = /^test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)$/gm;
  let match;
  while ((match = linePattern.exec(output)) !== null) {
    if (match[2] === 'ignored') continue;
    tests.push({
      name: match[1].trim(),
      passed: match[2] === 'ok',
      duration_ms: 0,
    });
  }

  // Parse summary: test result: ok. X passed; Y failed; Z ignored
  const summaryMatch = output.match(/test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored/);
  const passed = summaryMatch ? parseInt(summaryMatch[1], 10) : tests.filter(t => t.passed).length;
  const failed = summaryMatch ? parseInt(summaryMatch[2], 10) : tests.filter(t => !t.passed).length;
  const skipped = summaryMatch ? parseInt(summaryMatch[3], 10) : 0;
  const total = passed + failed + skipped;

  return { total, passed, failed, skipped, tests, raw_output: output, duration_ms, runner: 'cargo' };
}

function parseGenericOutput(output: string, duration_ms: number, exitSuccess: boolean): TestRunResult {
  // Try to find any pass/fail counts in the output
  const passMatch = output.match(/(\d+)\s+(?:pass(?:ed|ing)?|succeeded|ok)/i);
  const failMatch = output.match(/(\d+)\s+(?:fail(?:ed|ing|ure)?|error)/i);
  const skipMatch = output.match(/(\d+)\s+(?:skip(?:ped)?|pending|ignored)/i);

  const passed = passMatch ? parseInt(passMatch[1], 10) : (exitSuccess ? 1 : 0);
  const failed = failMatch ? parseInt(failMatch[1], 10) : (exitSuccess ? 0 : 1);
  const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;
  const total = passed + failed + skipped;

  return {
    total,
    passed,
    failed,
    skipped,
    tests: [],
    raw_output: output,
    duration_ms,
    runner: 'generic',
  };
}

// ─── Mock test runner ───────────────────────────────────────────────────────

async function mockRunTests(onOutput: OutputCallback): Promise<TestRunResult> {
  const lines = [
    '→ Running: npm test',
    '',
    ' PASS  src/components/SearchInput.test.tsx',
    '  SearchInput',
    '    ✓ renders without crashing (3ms)',
    '    ✓ updates value on change (8ms)',
    '    ✓ calls onSearch callback (5ms)',
    '    ✓ handles empty query (2ms)',
    '',
    ' PASS  src/utils/filter.test.ts',
    '  filterUsers',
    '    ✓ filters by name (1ms)',
    '    ✓ filters by email (2ms)',
    '    ✓ handles case insensitive search (1ms)',
    '    ✓ returns all when query is empty (1ms)',
    '',
    ' PASS  src/hooks/useDebounce.test.ts',
    '  useDebounce',
    '    ✓ returns initial value immediately (2ms)',
    '    ✓ debounces rapid changes (301ms)',
    '    ✓ cancels pending debounce on unmount (3ms)',
    '    ✓ handles zero delay (1ms)',
    '',
    'Test Suites: 3 passed, 3 total',
    'Tests:       12 passed, 12 total',
    'Time:        1.847s',
  ];

  for (const line of lines) {
    await new Promise(r => setTimeout(r, 80));
    onOutput(line);
  }

  return {
    total: 12,
    passed: 12,
    failed: 0,
    skipped: 0,
    tests: [
      { name: 'renders without crashing', passed: true, duration_ms: 3 },
      { name: 'updates value on change', passed: true, duration_ms: 8 },
      { name: 'calls onSearch callback', passed: true, duration_ms: 5 },
      { name: 'handles empty query', passed: true, duration_ms: 2 },
      { name: 'filters by name', passed: true, duration_ms: 1 },
      { name: 'filters by email', passed: true, duration_ms: 2 },
      { name: 'handles case insensitive search', passed: true, duration_ms: 1 },
      { name: 'returns all when query is empty', passed: true, duration_ms: 1 },
      { name: 'returns initial value immediately', passed: true, duration_ms: 2 },
      { name: 'debounces rapid changes', passed: true, duration_ms: 301 },
      { name: 'cancels pending debounce on unmount', passed: true, duration_ms: 3 },
      { name: 'handles zero delay', passed: true, duration_ms: 1 },
    ],
    raw_output: lines.join('\n'),
    duration_ms: 1847,
    runner: 'jest',
  };
}
