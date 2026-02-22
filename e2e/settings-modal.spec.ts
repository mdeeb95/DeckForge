import { test, expect } from '@playwright/test';
import { waitForApp, pressStart, pressA, pressB, dpadDown } from './helpers';

test.describe('Settings Modal', () => {
  test('opens via START menu', async ({ page }) => {
    await waitForApp(page);

    // Open START menu, then select Settings (item 0)
    await pressStart(page);
    await pressA(page);

    // Settings backdrop and content should be visible
    await expect(page.locator('.settings-backdrop')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('DeckForge Settings', { exact: false })).toBeVisible();
    await expect(page.getByText('Backend Mode')).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/settings-open.png' });
  });

  test('overlay preserves underlying screen', async ({ page }) => {
    await waitForApp(page);

    // Open settings
    await pressStart(page);
    await pressA(page);

    // Settings overlay is visible
    await expect(page.locator('.settings-backdrop')).toBeVisible({ timeout: 5000 });

    // Underlying empty_state content is still in the DOM
    await expect(page.getByText('No Projects Found')).toBeAttached();

    await page.screenshot({ path: 'e2e/screenshots/settings-overlay-preserves-screen.png' });
  });

  test('closes and returns to same screen', async ({ page }) => {
    await waitForApp(page);

    // Open settings
    await pressStart(page);
    await pressA(page);
    await expect(page.locator('.settings-backdrop')).toBeVisible({ timeout: 5000 });

    // Close settings with B
    await pressB(page);

    // Settings should be gone
    await expect(page.locator('.settings-backdrop')).not.toBeVisible({ timeout: 3000 });

    // Underlying screen still showing
    await expect(page.getByText('No Projects Found')).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/settings-closed-returns.png' });
  });

  test('D-pad navigation within settings', async ({ page }) => {
    await waitForApp(page);

    // Open settings
    await pressStart(page);
    await pressA(page);
    await expect(page.locator('.settings-backdrop')).toBeVisible({ timeout: 5000 });

    // Row 0 (Backend Mode) should be focused initially
    const rows = page.locator('[data-setting-row]');
    await expect(rows.nth(0)).toHaveClass(/focused/);

    // Press DPAD_DOWN — focus should move to row 1
    await dpadDown(page);
    await expect(rows.nth(1)).toHaveClass(/focused/);
    await expect(rows.nth(0)).not.toHaveClass(/focused/);

    // Press DPAD_DOWN again — focus should move to row 2
    await dpadDown(page);
    await expect(rows.nth(2)).toHaveClass(/focused/);

    await page.screenshot({ path: 'e2e/screenshots/settings-dpad-nav.png' });
  });

  test('footer hints are visible', async ({ page }) => {
    await waitForApp(page);

    // Open settings
    await pressStart(page);
    await pressA(page);
    await expect(page.locator('.settings-backdrop')).toBeVisible({ timeout: 5000 });

    // Check footer hint text
    const footer = page.locator('.settings-footer');
    await expect(footer.getByText('Navigate')).toBeVisible();
    await expect(footer.getByText('Toggle')).toBeVisible();
    await expect(footer.getByText('Adjust')).toBeVisible();
    await expect(footer.getByText('Back')).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/settings-footer.png' });
  });
});
