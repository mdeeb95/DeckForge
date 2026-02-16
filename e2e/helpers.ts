import { type Page, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

// Debug keyboard shortcuts map screen names to number keys
const screenKeys: Record<string, string> = {
  level1: '1',
  level2: '2',
  level3: '3',
  project_select: '4',
  empty_state: '5',
  ai_working: '6',
  qa_mode: '7',
  deploy_mode: '8',
  history: '9',
  exploration: '0',
  voice_pitch: '-',
  error: '=',
  screenshot_feedback: 'p',
};

// Keyboard → gamepad button mapping (matches App.svelte)
const buttonKeys: Record<string, string> = {
  A: 'Enter',
  B: 'Escape',
  X: 'q',
  Y: 'e',
  DPAD_UP: 'ArrowUp',
  DPAD_DOWN: 'ArrowDown',
  DPAD_LEFT: 'ArrowLeft',
  DPAD_RIGHT: 'ArrowRight',
  RB: 'Tab',
  START: 'm',
  SELECT: 'v',
};

/** Navigate to a screen using debug keyboard shortcuts */
export async function goToScreen(page: Page, screen: string) {
  const key = screenKeys[screen];
  if (!key) throw new Error(`Unknown screen: ${screen}`);
  await page.keyboard.press(key);
  // Allow Svelte to re-render
  await page.waitForTimeout(200);
}

/** Press a gamepad button via keyboard mapping.
 *  Dispatches the KeyboardEvent directly on the window to ensure
 *  the App.svelte keydown handler receives it reliably. */
export async function pressButton(page: Page, button: string) {
  const key = buttonKeys[button];
  if (!key) throw new Error(`Unknown button: ${button}`);
  await page.evaluate((k) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
  }, key);
  await page.waitForTimeout(250);
}

/** Press A button (Enter) */
export async function pressA(page: Page) {
  await pressButton(page, 'A');
}

/** Press B button (Escape) */
export async function pressB(page: Page) {
  await pressButton(page, 'B');
}

/** Press X button (q) */
export async function pressX(page: Page) {
  await pressButton(page, 'X');
}

/** Press Y button (e) */
export async function pressY(page: Page) {
  await pressButton(page, 'Y');
}

/** D-pad down */
export async function dpadDown(page: Page) {
  await pressButton(page, 'DPAD_DOWN');
}

/** D-pad up */
export async function dpadUp(page: Page) {
  await pressButton(page, 'DPAD_UP');
}

/** Press LB (Shift tap — keydown then keyup with no combo) */
export async function pressLB(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(250);
}

/** Wait for the app to finish initial load (including async config init) */
export async function waitForApp(page: Page) {
  await page.goto('/');
  // Wait for initApp() to complete — it navigates to empty_state after
  // async config load finishes, rendering "No Projects Found".
  // This ensures the app is fully initialized before tests interact.
  await page.waitForSelector('text=No Projects Found', { timeout: 10_000 });
  await page.waitForTimeout(100);
}

/** Get the ActionPalette title text (only works on screens using ActionPalette) */
export async function getPaletteTitle(page: Page): Promise<string> {
  const el = page.locator('aside h2').first();
  await expect(el).toBeVisible({ timeout: 5000 });
  return (await el.textContent()) ?? '';
}

/** Get all visible card titles (h3 elements anywhere on page) */
export async function getCardTitles(page: Page): Promise<string[]> {
  const cards = page.locator('h3');
  return cards.allTextContents();
}

/** Check if a specific text exists on the page */
export async function hasText(page: Page, text: string): Promise<boolean> {
  const count = await page.getByText(text, { exact: false }).count();
  return count > 0;
}

/** Expect a card with the given title to be visible */
export async function expectCard(page: Page, title: string) {
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 5000 });
}

/** Expect the page to contain specific text */
export async function expectPageContains(page: Page, text: string) {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: 5000 });
}

/** Expect a visible heading with the given text */
export async function expectHeading(page: Page, text: string) {
  await expect(page.getByRole('heading', { name: text }).first()).toBeVisible({ timeout: 5000 });
}

/** Click a card by its title text.
 *  Scopes to aside panel when present to avoid terminal text matches,
 *  falls back to h3 heading match for screens without aside. */
export async function clickCard(page: Page, title: string) {
  const aside = page.locator('aside');
  if (await aside.count() > 0) {
    await aside.getByText(title, { exact: true }).first().click();
  } else {
    await page.getByRole('heading', { name: title, level: 3 }).first().click();
  }
  await page.waitForTimeout(300);
}
