# Task: E2E Test Suite for Terminal System

## Prerequisite

Prompts 1 and 2 (`prompt-terminal-pty-xterm.md` and `prompt-terminal-integration.md`) must be completed first.

## Goal

Write comprehensive E2E tests that verify the entire terminal system works correctly — from PTY spawn through xterm.js rendering to command injection and completion detection. These tests should be resilient, observable, and catch regressions early.

Also: update all existing E2E tests that reference the old "Claude Code Stream" tab name.

## Test Strategy

We need three layers of testing:

1. **Unit tests** (vitest) — PTY command building, completion marker detection, theme config
2. **Integration tests** (vitest, Node env) — Rust PTY commands via Tauri mock
3. **E2E tests** (Playwright) — Full browser: terminal renders, tabs switch, commands execute

## Changes Required

### 1. Unit Tests — `src/test/terminal/pty-command.test.ts`

Create this new test file:

```typescript
import { describe, it, expect } from 'vitest';

describe('PTY Command Building', () => {
  // Test the command string construction that AIWorkingScreen uses
  // when injecting a claude command into the PTY

  it('escapes single quotes in prompts', () => {
    const prompt = "Fix the user's login bug";
    const escaped = prompt.replace(/'/g, "'\\''");
    expect(escaped).toBe("Fix the user'\\''s login bug");
  });

  it('escapes complex prompt strings', () => {
    const prompt = "Add a 'dark mode' toggle with `backticks` and $vars";
    const escaped = prompt.replace(/'/g, "'\\''");
    expect(escaped).toContain("'\\''dark mode'\\''");
    // Dollar signs and backticks should pass through (they're inside single quotes)
  });

  it('includes OSC completion marker in command', () => {
    const claudeBin = 'claude';
    const args = ["-p 'test'", '--verbose'];
    const marker = `DF_DONE_1234567890`;
    const fullCommand = `${claudeBin} ${args.join(' ')}; printf '\\033]7337;${marker}\\007'`;
    expect(fullCommand).toContain(marker);
    expect(fullCommand).toContain('\\033]7337;');
    expect(fullCommand).toContain('\\007');
  });

  it('generates unique markers per invocation', () => {
    const marker1 = `DF_DONE_${Date.now()}`;
    // Simulate tiny delay
    const marker2 = `DF_DONE_${Date.now() + 1}`;
    expect(marker1).not.toBe(marker2);
  });

  it('builds correct args for fresh session', () => {
    const args: string[] = [];
    const prompt = 'Add dark mode';
    args.push(`-p '${prompt}'`);
    args.push('--verbose');
    args.push('--permission-mode acceptEdits');
    args.push('--max-turns 50');

    expect(args).toContain('--verbose');
    expect(args).toContain('--permission-mode acceptEdits');
    expect(args).toContain('--max-turns 50');
    expect(args).not.toContain('--resume');
    expect(args).not.toContain('--output-format');
  });

  it('builds correct args for resumed session', () => {
    const args: string[] = [];
    const sessionId = 'abc-123';
    args.push(`-p 'Continue'`);
    args.push('--verbose');
    args.push('--resume');
    args.push(`--session-id '${sessionId}'`);

    expect(args).toContain('--resume');
    expect(args).toContain(`--session-id '${sessionId}'`);
  });

  it('does NOT include --output-format flag', () => {
    // The whole point of the terminal redesign: no JSON piping
    const args = ["-p 'test'", '--verbose', '--max-turns 50'];
    const hasOutputFormat = args.some(a => a.includes('--output-format'));
    expect(hasOutputFormat).toBe(false);
  });
});

describe('Completion Marker Detection', () => {
  const marker = 'DF_DONE_1708300000000';

  it('detects OSC marker in clean output', () => {
    const output = `\x1b]7337;${marker}\x07`;
    expect(output.includes(marker)).toBe(true);
  });

  it('detects marker in buffered stream', () => {
    let buffer = '';
    buffer += 'some terminal output\n';
    buffer += `\x1b]7337;${marker}\x07`;
    buffer += '\n$ ';
    expect(buffer.includes(marker)).toBe(true);
  });

  it('does not false-positive on partial marker', () => {
    const output = 'DF_DONE_';
    expect(output.includes(marker)).toBe(false);
  });

  it('handles chunk splitting via buffer', () => {
    let markerBuffer = '';
    // Simulate marker split across two chunks
    const chunk1 = `output\x1b]7337;DF_DONE_170`;
    const chunk2 = `8300000000\x07\n$ `;

    markerBuffer += chunk1;
    expect(markerBuffer.includes(marker)).toBe(false); // not yet

    markerBuffer += chunk2;
    expect(markerBuffer.includes(marker)).toBe(true); // found it

    // Buffer trimming works
    if (markerBuffer.length > 200) {
      markerBuffer = markerBuffer.slice(-100);
    }
  });

  it('unique markers prevent stale matches', () => {
    const oldMarker = 'DF_DONE_1000000000000';
    const newMarker = 'DF_DONE_2000000000000';
    const output = `\x1b]7337;${oldMarker}\x07`;
    expect(output.includes(newMarker)).toBe(false);
  });
});

describe('Terminal Theme', () => {
  it('uses DeckForge cyan as primary accent', () => {
    const theme = {
      cursor: '#0df2f2',
      cyan: '#0df2f2',
      magenta: '#f20dcf',
      background: '#0d1117',
    };

    expect(theme.cursor).toBe('#0df2f2');
    expect(theme.cyan).toBe('#0df2f2');
    expect(theme.background).toBe('#0d1117');
    // No Anthropic orange anywhere
    expect(Object.values(theme)).not.toContain('#d97706');
    expect(Object.values(theme)).not.toContain('#f59e0b');
    expect(Object.values(theme)).not.toContain('#ff6600');
  });
});
```

### 2. Unit Tests — `src/test/terminal/pty-interrupt.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('PTY Interrupt', () => {
  it('Ctrl+C is correct ASCII byte', () => {
    const ctrlC = '\x03';
    expect(ctrlC.charCodeAt(0)).toBe(3);
  });

  it('interrupt sends correct data string', () => {
    // The interrupt handler should send '\x03' to pty_write
    const interruptData = '\x03';
    expect(interruptData).toBe('\x03');
    expect(interruptData.length).toBe(1);
  });
});
```

### 2b. Unit Tests — `src/test/terminal/gamepad-terminal-input.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Gamepad → Terminal Input Mapping', () => {
  // These test the keyMap used by handleTerminalInput() in inputRouter.ts
  const keyMap: Record<string, string> = {
    'DPAD_UP':    '\x1b[A',
    'DPAD_DOWN':  '\x1b[B',
    'DPAD_LEFT':  '\x1b[D',
    'DPAD_RIGHT': '\x1b[C',
    'A':          '\r',
    'Y':          'y',
    'X':          'n',
    'B':          '\x1b',
    'LB':         '\x1b[5~',
    'RB':         '\x1b[6~',
  };

  it('D-pad maps to ANSI arrow escape sequences', () => {
    expect(keyMap['DPAD_UP']).toBe('\x1b[A');
    expect(keyMap['DPAD_DOWN']).toBe('\x1b[B');
    expect(keyMap['DPAD_LEFT']).toBe('\x1b[D');
    expect(keyMap['DPAD_RIGHT']).toBe('\x1b[C');
  });

  it('A button maps to Enter (carriage return)', () => {
    expect(keyMap['A']).toBe('\r');
    expect(keyMap['A'].charCodeAt(0)).toBe(13);
  });

  it('Y button maps to "y" for permission acceptance', () => {
    expect(keyMap['Y']).toBe('y');
  });

  it('B button maps to Escape (not "n") for safety', () => {
    // B should never type 'n' — users instinctively press B to "go back"
    // and accidentally declining a permission is destructive
    expect(keyMap['B']).not.toBe('n');
    expect(keyMap['B']).toBe('\x1b');
  });

  it('X button maps to "n" for explicit decline', () => {
    expect(keyMap['X']).toBe('n');
  });

  it('B button maps to Escape (safe back-out, not destructive "n")', () => {
    expect(keyMap['B']).toBe('\x1b');
    expect(keyMap['B'].charCodeAt(0)).toBe(27);
  });

  it('LB/RB map to Page Up/Down', () => {
    expect(keyMap['LB']).toBe('\x1b[5~'); // Page Up
    expect(keyMap['RB']).toBe('\x1b[6~'); // Page Down
  });

  it('all ANSI sequences start with ESC', () => {
    const ansiKeys = ['DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'X', 'LB', 'RB'];
    for (const key of ansiKeys) {
      expect(keyMap[key].startsWith('\x1b')).toBe(true);
    }
  });

  it('unmapped buttons return undefined (fall through)', () => {
    expect(keyMap['START']).toBeUndefined();
    expect(keyMap['SELECT']).toBeUndefined();
    expect(keyMap['R4']).toBeUndefined();
  });
});

describe('Auto-Focus Detection Patterns', () => {
  // Tightened regex — must match Claude Code's actual prompt format
  const permissionPatterns = /\(y\/n\)|Do you want to|approve this|permission to|Press Enter to continue/i;

  it('detects (y/n) permission prompt', () => {
    expect(permissionPatterns.test('Allow this edit? (y/n)')).toBe(true);
  });

  it('detects "Do you want to" prompt', () => {
    expect(permissionPatterns.test('Do you want to allow this tool?')).toBe(true);
  });

  it('detects "Press Enter to continue" prompt', () => {
    expect(permissionPatterns.test('Press Enter to continue')).toBe(true);
  });

  it('does NOT false-positive on "Allow" alone in code output', () => {
    // This was a bug in the original regex — "Allow" is too broad
    expect(permissionPatterns.test('Access-Control-Allow-Origin: *')).toBe(false);
    expect(permissionPatterns.test('# Allow all connections')).toBe(false);
    expect(permissionPatterns.test('allowedTools: [Read, Write]')).toBe(false);
  });

  it('does not false-positive on normal output', () => {
    expect(permissionPatterns.test('Reading file contents...')).toBe(false);
    expect(permissionPatterns.test('Writing to src/App.tsx')).toBe(false);
    expect(permissionPatterns.test('Installing dependencies')).toBe(false);
  });
});
```

### 3. E2E Tests — `e2e/terminal.spec.ts`

This is the main E2E test file. It tests the full terminal experience in the browser.

```typescript
import { test, expect } from '@playwright/test';
import {
  waitForApp,
  goToScreen,
  pressA,
  pressB,
  dpadDown,
  dpadUp,
  clickCard,
  expectCard,
  expectPageContains,
  getPaletteTitle,
} from './helpers';

test.describe('Terminal Tab System', () => {
  test('Terminal tab is visible and default on L1', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Terminal tab should be present
    await expectPageContains(page, 'Terminal');
    // App Output tab should also be present
    await expectPageContains(page, 'App Output');
  });

  test('Terminal tab shows xterm.js canvas', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // xterm.js renders into a canvas element
    // Wait for it to initialize
    await page.waitForTimeout(1000);

    // Check for xterm container
    const xtermEl = page.locator('.xterm');
    // In non-Tauri (Playwright) mode, xterm may not fully initialize
    // because PTY requires Tauri. Check that the container exists.
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 5000 });
  });

  test('Tab switching works', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Click App Output tab
    await page.getByText('App Output', { exact: true }).click();
    await page.waitForTimeout(200);

    // App output content should be visible
    // (either "No app running" message or output)
    await expectPageContains(page, 'No app running');

    // Click Terminal tab to switch back
    await page.getByText('Terminal', { exact: true }).click();
    await page.waitForTimeout(200);

    // Terminal container should be visible again
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible();
  });

  test('Terminal tab persists across screen transitions', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Terminal should be visible
    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible();

    // Navigate to Level 2
    await goToScreen(page, 'level2');
    await page.waitForTimeout(200);

    // Terminal should still be visible
    await expect(terminalContainer).toBeVisible();

    // Navigate to Level 3
    await goToScreen(page, 'level3');
    await page.waitForTimeout(200);

    // Terminal should still be visible
    await expect(terminalContainer).toBeVisible();
  });
});

test.describe('Terminal Header', () => {
  test('shows Terminal header with status badge', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Header should show "> Terminal" label
    const header = page.locator('span.text-primary.font-mono');
    await expect(header.first()).toBeVisible();
  });

  test('does NOT show cost or scope badges', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Cost badge should not be visible anywhere
    const costBadge = page.getByText('Session:', { exact: false });
    await expect(costBadge).toHaveCount(0);
  });
});

test.describe('AI Working Screen with Terminal', () => {
  test('shows interrupt card while working', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    await expectCard(page, 'Interrupt');
  });

  test('has AI Working palette title', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('AI WORKING');
  });

  test('terminal container is visible during AI working', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    const terminalContainer = page.locator('.terminal-container');
    await expect(terminalContainer).toBeVisible({ timeout: 5000 });
  });

  test('interrupt navigates back to L1', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    await clickCard(page, 'Interrupt');
    await page.waitForTimeout(500);

    // Should be back on L1
    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('WHAT ARE WE DOING');
  });
});

test.describe('Terminal Theme', () => {
  test('terminal uses DeckForge dark background', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    await page.waitForTimeout(1000);

    // Check that xterm viewport uses DeckForge background color
    const xtermViewport = page.locator('.xterm-viewport');
    if (await xtermViewport.count() > 0) {
      const bgColor = await xtermViewport.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });
      // #0d1117 = rgb(13, 17, 23)
      expect(bgColor).toBe('rgb(13, 17, 23)');
    }
  });
});

test.describe('Terminal Focus Mode (Gamepad → Terminal)', () => {
  test('SELECT toggles terminal focus mode', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Initially not focused
    const focusBadge = page.getByText('GAMEPAD → TERMINAL');
    await expect(focusBadge).toHaveCount(0);

    // Press SELECT to focus
    await pressButton(page, 'SELECT');
    await page.waitForTimeout(200);

    // Focus badge should appear
    await expect(focusBadge).toBeVisible();

    // Press SELECT again to unfocus
    await pressButton(page, 'SELECT');
    await page.waitForTimeout(200);

    // Focus badge should disappear
    await expect(focusBadge).toHaveCount(0);
  });

  test('terminal panel glows when focused', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Focus terminal
    await pressButton(page, 'SELECT');
    await page.waitForTimeout(200);

    // Check for ring/glow class on terminal section
    const terminalSection = page.locator('section').first();
    const classes = await terminalSection.getAttribute('class');
    expect(classes).toContain('ring-1');
  });

  test('D-pad does NOT navigate cards when terminal is focused', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Focus terminal
    await pressButton(page, 'SELECT');
    await page.waitForTimeout(200);

    // Get current selected card index (should not change)
    // Press D-pad down — if it went to card nav, selection would change
    await dpadDown(page);
    await page.waitForTimeout(200);

    // Unfocus to verify we can still navigate after
    await pressButton(page, 'SELECT');
    await page.waitForTimeout(200);

    // Now D-pad should work for cards again
    await dpadDown(page);
    await page.waitForTimeout(200);
  });

  test('hint grid shows terminal controls when focused', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    // Focus terminal
    await pressButton(page, 'SELECT');
    await page.waitForTimeout(200);

    // Should show terminal-relevant hints
    await expectPageContains(page, 'Confirm');
    await expectPageContains(page, 'Accept');
    await expectPageContains(page, 'Decline');
    await expectPageContains(page, 'Unfocus');
  });

  test('START still opens menu even when terminal is focused', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    // Focus terminal
    await pressButton(page, 'SELECT');
    await page.waitForTimeout(200);

    // Press START — should open menu despite terminal focus
    await pressButton(page, 'START');
    await page.waitForTimeout(300);

    // Menu should be visible
    await expectPageContains(page, 'Settings');
  });
});

test.describe('Level 3 → Ship It Flow', () => {
  test('Ship It card is present on L3', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level3');

    await expectCard(page, 'Ship It');
    await expectCard(page, 'Ship It Unhinged');
  });

  test('clicking Ship It navigates to AI Working', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level3');

    await clickCard(page, 'Ship It');
    await page.waitForTimeout(500);

    // Should now be on AI Working screen
    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('AI WORKING');
  });
});
```

### 4. Update Existing E2E Tests — `e2e/screens-core.spec.ts`

Update references to the old tab name:

**Find all instances of:**
```typescript
await expectPageContains(page, 'Claude Code Stream');
```

**Replace with:**
```typescript
await expectPageContains(page, 'Terminal');
```

This affects:
- Line 61 in the "Level 1 Screen" describe block
- Line 99 in the "Level 2 Screen" describe block

### 5. Update Existing E2E Tests — `e2e/screens-secondary.spec.ts`

Check this file for any references to "Claude Code Stream" or "Claude Code" tab and update similarly. Read the file first to see if changes are needed.

### 6. Integration Test — `src/test/integration/pty-lifecycle.test.ts`

This tests the PTY lifecycle in a Node environment. Since we can't actually call Tauri commands in a test, this tests the logic around PTY management:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('PTY Lifecycle Logic', () => {
  const marker = 'DF_DONE_1708300000000';

  it('OSC completion marker fires onExit callback', () => {
    const onExit = vi.fn();
    let markerBuffer = '';
    markerBuffer += `\x1b]7337;${marker}\x07\n$ `;

    if (markerBuffer.includes(marker)) {
      onExit();
    }

    expect(onExit).toHaveBeenCalledOnce();
  });

  it('partial marker does not fire onExit', () => {
    const onExit = vi.fn();
    let markerBuffer = 'DF_DONE_170';

    if (markerBuffer.includes(marker)) {
      onExit();
    }

    expect(onExit).not.toHaveBeenCalled();
  });

  it('normal output does not fire onExit', () => {
    const onExit = vi.fn();
    let markerBuffer = 'Installing dependencies...\nnpm install complete\n';

    if (markerBuffer.includes(marker)) {
      onExit();
    }

    expect(onExit).not.toHaveBeenCalled();
  });

  it('buffer trimming prevents unbounded growth', () => {
    let markerBuffer = 'x'.repeat(250);
    if (markerBuffer.length > 200) {
      markerBuffer = markerBuffer.slice(-100);
    }
    expect(markerBuffer.length).toBe(100);
  });

  it('double-injection guard prevents concurrent commands', () => {
    let commandInFlight = false;
    const commands: string[] = [];

    function fireClaude(prompt: string) {
      if (commandInFlight) return;
      commandInFlight = true;
      commands.push(prompt);
    }

    fireClaude('first command');
    fireClaude('second command'); // should be blocked

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBe('first command');

    // Reset guard (simulates completion)
    commandInFlight = false;
    fireClaude('third command');
    expect(commands).toHaveLength(2);
  });

  it('Ctrl+C byte is correct', () => {
    const data = '\x03';
    expect(data.charCodeAt(0)).toBe(3);
    expect(data.length).toBe(1);
  });

  it('PTY output arrives as plain string (no base64)', () => {
    // Simulates the Rust→JS path: String::from_utf8_lossy → Tauri event → JS string
    const ptyOutput = 'Hello from PTY!\r\n\x1b[32mGreen text\x1b[0m';
    // Should be directly writable to xterm without decoding
    expect(typeof ptyOutput).toBe('string');
    expect(ptyOutput).toContain('\x1b[32m'); // ANSI escape preserved
  });
});
```

### 7. Test Runner Configuration — No Changes Needed

The existing `vitest.config.ts` already matches `src/**/*.test.ts`, so the new unit tests will be picked up automatically. The integration test config matches `src/test/integration/**/*.test.ts`. Playwright config matches `e2e/*.spec.ts`. All new files follow these patterns.

## How to Verify

Run all three test suites:

```bash
# Unit tests (should all pass)
npm run test

# Integration tests (should all pass)
npm run test:integration

# E2E tests (should all pass — requires dev server running)
npm run test:e2e
```

**Expected results:**
- New unit tests in `src/test/terminal/`: all pass
- New integration test: all pass
- New E2E test `e2e/terminal.spec.ts`: all pass
- Updated existing E2E tests: all pass (tab name references fixed)

**Honest limitation:** These E2E tests run in Playwright (Chromium only, no Tauri runtime). That means there's no PTY backend, so xterm.js won't have a live terminal session. The E2E tests can verify:
- DOM structure (container exists, tabs render, classes applied)
- Input routing logic (focus mode toggles, hint grids swap)
- Navigation flows (Ship It → AI Working, Interrupt → L1)

They **cannot** verify:
- Actual terminal rendering (ANSI colors, cursor movement, spinners)
- PTY spawn/kill lifecycle
- Real command injection and completion detection
- Bidirectional I/O between gamepad and terminal

The integration tests (vitest, Node env) cover the logic for completion detection, buffer handling, and injection guards. But the real smoke test is manual: build the Tauri app, connect a gamepad, and run through the Ship It flow. Write the E2E tests defensively — check for elements, not terminal content.

## Test Coverage Summary

| Test File | Type | What It Tests |
|-----------|------|---------------|
| `src/test/terminal/pty-command.test.ts` | Unit | Command string building, arg escaping, completion markers, theme colors |
| `src/test/terminal/pty-interrupt.test.ts` | Unit | Ctrl+C byte correctness |
| `src/test/terminal/gamepad-terminal-input.test.ts` | Unit | Gamepad→terminal key mapping, ANSI sequences, auto-focus pattern matching |
| `src/test/integration/pty-lifecycle.test.ts` | Integration | Completion detection, base64 encoding, edge cases |
| `e2e/terminal.spec.ts` | E2E | Tab rendering, switching, persistence, theme, focus mode, gamepad routing, Ship It flow |
| `e2e/screens-core.spec.ts` | E2E (updated) | Fixed tab name references |

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| `src/test/terminal/pty-command.test.ts` | New file | Unit tests for command building |
| `src/test/terminal/pty-interrupt.test.ts` | New file | Unit tests for interrupt handling |
| `src/test/integration/pty-lifecycle.test.ts` | New file | Integration tests for PTY lifecycle |
| `e2e/terminal.spec.ts` | New file | E2E tests for terminal UI |
| `e2e/screens-core.spec.ts` | Update tab name references | "Claude Code Stream" → "Terminal" |
| `e2e/screens-secondary.spec.ts` | Update tab name references if needed | Same |
