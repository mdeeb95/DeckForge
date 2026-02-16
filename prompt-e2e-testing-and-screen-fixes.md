# Prompt: E2E Screen Interaction Testing + Broken Screen Fixes

## Context
DeckForge is a gamepad-only app (1280×800, Steam Deck). Every screen has a split layout: terminal panel left, action palette right. Users navigate with D-pad (up/down moves `selectedCardIndex`), press A/Enter to activate the selected card's `onclick`, and press B/Escape to go back. The shared `screenCards` store holds the cards for each screen — each card MUST have an `onclick` handler or pressing A does nothing. Screens that render their own HTML instead of using the `ActionPalette` component must still visually react to `selectedCardIndex` changes.

## Part 1: Fix Broken Screens

> **Already fixed (skip these):**
> - EmptyStateScreen — all 4 cards now have onclick handlers, visual selection is reactive to selectedCardIndex, Tauri dialog plugin installed, inputRouter wired for B and X buttons.
> - ActionPalette — breadcrumb + step dot props already added to L1/L2/L3/QA/Deploy.

### 1A — ExplorationScreen.svelte
**Problem:** Fully static/hardcoded. `screenCards.set()` maps cards WITHOUT onclick handlers. The HTML cards have no click handlers either. Pressing A does nothing.

**Fix:**
- Import and use `ActionPalette` component instead of hardcoded card HTML
- Add onclick handlers to all 4 cards:
  - A ("Ask a Question"): Should set up a new exploration prompt — for now, just log to terminal entries: `entries.addEntry({ type: 'cursor', message: 'Ask a Question — not yet implemented' })`
  - B ("Dive Deeper"): Same pattern — placeholder with terminal message
  - X ("New Topic"): Same — placeholder
  - Y ("Surprise Me"): Same — placeholder with something ridiculous per design rules
- Wire `screenCards.set()` with onclick handlers in an `$effect` block
- Pass `selectedIndex={$selectedCardIndex}` to ActionPalette

### 1B — ErrorScreen.svelte
**Problem:** Cards X ("View Error Details") and Y ("Ignore and Continue") have no onclick handlers. User presses A on them and nothing happens.

**Fix:**
- X ("View Error Details"): onclick should display the full error in the terminal panel. Access the error from `get(entries)` or wherever the error state lives, and re-render it as a `code` entry with full stack trace
- Y ("Ignore and Continue"): onclick should navigate to `level1` (back to home, ignoring the error)
- Make sure the onclick handlers are included in the `screenCards.set()` call

### 1C — Level2Screen.svelte
**Problem:** Card X has no onclick. X is the "modifier" card (e.g. "Make it accessible", "Add dark mode"). Pressing X does nothing.

**Fix:**
- X is a modifier toggle — its onclick should toggle a `modifierActive` state
- When toggled ON: update the pill to show active state, and prepend the modifier text to the selected suggestion when navigating to L3
- If that's too complex for now, at minimum make X onclick toggle a visual indicator and store the modifier selection in a local `$state` variable. The modifier text can be passed as part of the plan on L3.

### 1D — Level3Screen.svelte
**Problem:** Card X ("Tell Me More") has no onclick. Pressing X does nothing.

**Fix:**
- X onclick should expand the plan detail in the terminal panel. Add an `expandPlan()` function that:
  - Sets `status` to `'streaming'`
  - Adds a terminal entry with type `'prompt'` label `'EXPANDED PLAN'`
  - Shows the full plan body (from the current prediction/plan data) as a `'thought'` entry
  - If no expanded detail is available, show: "No additional details available for this plan."
  - Sets `status` back to `'idle'`

## Part 2: Set Up Playwright E2E Testing

### 2A — Install and configure
```bash
npm install -D @playwright/test
npx playwright install chromium
```

Create `playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
```

Add script to `package.json`:
```json
"test:e2e": "playwright test"
```

### 2B — Create test helper: `e2e/helpers.ts`
```ts
import { Page } from '@playwright/test';

/** Press a keyboard key that maps to a gamepad button */
export async function pressButton(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100); // debounce
}

/** Navigate to a specific screen using debug keyboard shortcuts */
export async function goToScreen(page: Page, screenNum: number) {
  // Debug shortcuts: 1-9 for screens 1-9, 0/-/= for 10-12
  const keyMap: Record<number, string> = {
    1: '1', 2: '2', 3: '3', 4: '4', 5: '5',
    6: '6', 7: '7', 8: '8', 9: '9', 10: '0',
    11: 'Minus', 12: 'Equal',
  };
  const key = keyMap[screenNum];
  if (key) await page.keyboard.press(key);
  await page.waitForTimeout(200);
}

/** D-pad down = ArrowDown */
export const dpadDown = (page: Page) => pressButton(page, 'ArrowDown');
/** D-pad up = ArrowUp */
export const dpadUp = (page: Page) => pressButton(page, 'ArrowUp');
/** A button = Enter */
export const pressA = (page: Page) => pressButton(page, 'Enter');
/** B button = Escape */
export const pressB = (page: Page) => pressButton(page, 'Escape');
```

### 2C — Write E2E tests for every screen

Create `e2e/screens.spec.ts` with one `test.describe` block per screen. Each test should:

1. Navigate to the screen via debug shortcut
2. Verify the screen renders (check for a known text element)
3. Test D-pad navigation moves the selected card (check CSS class changes — the selected card has a cyan left border `border-l-primary`)
4. Test pressing A/Enter activates the selected card (check for navigation or terminal output change)
5. Test pressing B/Escape goes back (check screen changes)

Here's what to test per screen:

**EmptyStateScreen (screen 1 — default landing)**
- Loads on app start
- 4 cards visible: Open Directory, Paste a Path, Clone from Git, Demo Mode
- D-pad down moves selection from card 0 to card 1 (cyan border moves)
- Press A on Demo Mode (card index 3) → navigates somewhere or shows terminal output
- Press Y activates Demo Mode

**Level1Screen (debug key 2)**
- Shows 4 category cards: Feature, Bug, Tech Debt, Yolo
- D-pad moves selection
- Press A on any card → navigates to Level 2 (screen changes)
- Yolo card (Y) should have pink styling

**Level2Screen (debug key 3)**
- Shows suggestion cards A and B, modifier X, wild card Y
- D-pad moves selection between cards
- Press A → navigates to Level 3
- Press B → navigates to Level 3 (second suggestion)

**Level3Screen (debug key 4)**
- Shows Ship It (A), Go Back (B), Tell Me More (X), Ship It Unhinged (Y)
- Press B → goes back to Level 2
- Press A → navigates to AI Working screen
- Press X → expands plan in terminal (after fix)

**ProjectSelectScreen (debug key 5)**
- Shows project list
- D-pad moves highlight between projects
- Press A → navigates to Level 1

**AIWorkingScreen (debug key 6)**
- Shows terminal output with working indicator
- Cards update when task completes

**QAModeScreen (debug key 7)**
- Shows test results in terminal
- 4 cards: Approve, Reject, Run Tests, View Diff
- All cards should be clickable

**DeployModeScreen (debug key 8)**
- Shows deploy options
- 4 cards with onclick handlers
- D-pad moves selection

**HistoryScreen (debug key 9)**
- Shows git timeline in terminal
- D-pad moves through commits
- A previews selected commit
- Y triggers rollback flow

**ExplorationScreen (debug key 0)**
- Shows exploration/chat interface
- Cards should have onclick handlers (after fix)
- D-pad moves selection

**VoicePitchScreen (debug key -)**
- Shows voice input interface
- Phase-based cards (idle → recording → done)
- A starts recording in idle phase

**ErrorScreen (debug key =)**
- Shows error with red styling
- A = Retry, B = Undo (both work)
- X = View Error Details, Y = Ignore (both should work after fix)

## Part 3: Run tests and verify

After implementing all fixes and writing the E2E tests:

1. Run `npm test` — all existing unit tests should still pass
2. Run `npm run test:e2e` — verify each screen test passes
3. If any test fails, fix the underlying screen code (not the test) unless the test expectation is wrong
4. Take a screenshot of each screen after fixes to verify the visual layout still fits 1280×800 with no scroll

## Important Notes
- Do NOT add scroll to any screen. 1280×800 is fixed.
- Use Svelte 5 syntax: `onclick` not `on:click`, `$state` not `let`, `$derived` not `$:`, `$effect` not `afterUpdate`
- Every screen's cards MUST be registered in `screenCards.set()` with onclick handlers
- ActionPalette requires: `breadcrumb`, `title`, `subtitle`, `cards`, `secondaryCards` (optional), `selectedIndex`
- Card shape for ActionPalette: `{ button: string, title: string, description: string, pills?: Array<{label: string, variant: string}>, variant?: string, onclick: () => void }`
- The selected card's visual indicator is handled by ActionPalette — just pass `selectedIndex={$selectedCardIndex}`
