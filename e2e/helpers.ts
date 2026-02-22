import { type Page, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

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
  START: 'n',
  SELECT: 'v',
};

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

/** Press START button (m) */
export async function pressStart(page: Page) {
  await pressButton(page, 'START');
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

/** Wait for the app to finish initial load (including async config init).
 *  In browser mode the app shows a LoginScreen because there's no Tauri
 *  session to restore.  We mock Google Identity Services and the auth API
 *  so the app authenticates automatically and lands on empty_state. */
export async function waitForApp(page: Page) {
  // 1. Block the real Google Identity Services script so our mock takes over
  await page.route('**/accounts.google.com/gsi/client', (route) => route.abort());

  // 2. Mock GIS — LoginScreen polls for window.google.accounts.id
  await page.addInitScript(() => {
    (window as any).google = {
      accounts: {
        id: {
          initialize: (cfg: any) => { (window as any).__gis_cb = cfg.callback; },
          renderButton: () => {},
        },
      },
    };
  });

  // 3. Intercept the auth API so the backend is never contacted
  await page.route('**/api/v1/auth/google', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-token',
        refresh_token: 'e2e-refresh',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        email: 'e2e@test.local',
        display_name: 'E2E Test',
        is_admin: false,
      }),
    });
  });

  await page.goto('/');

  // 4. Wait for GIS mock to be initialized, then trigger the callback
  await page.waitForFunction(() => !!(window as any).__gis_cb, { timeout: 10_000 });
  await page.evaluate(() => {
    (window as any).__gis_cb({ credential: 'fake-e2e-jwt' });
  });

  // 5. Wait for the app to finish auth and render empty_state
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
