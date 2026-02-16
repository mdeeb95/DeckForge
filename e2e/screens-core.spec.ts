import { test, expect } from '@playwright/test';
import {
  waitForApp,
  goToScreen,
  pressA,
  pressB,
  pressX,
  pressY,
  pressLB,
  dpadDown,
  dpadUp,
  clickCard,
  expectCard,
  expectPageContains,
  expectHeading,
  getCardTitles,
  getPaletteTitle,
} from './helpers';

test.describe('EmptyState Screen', () => {
  test('renders with correct cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'empty_state');

    await expectHeading(page, 'No Projects Found');
    await expectCard(page, 'Open Directory');
    await expectCard(page, 'Paste a Path');
    await expectCard(page, 'Clone from Git');
    await expectCard(page, 'Demo Mode');
  });

  test('D-pad changes selection', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'empty_state');

    await expectCard(page, 'Open Directory');
    await dpadDown(page);
    await dpadUp(page);
  });
});

test.describe('Level 1 Screen (Category Select)', () => {
  test('renders with correct title and cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('WHAT ARE WE DOING');

    await expectCard(page, 'Feature');
    await expectCard(page, 'Bug');
    await expectCard(page, 'Tech Debt');
    await expectCard(page, 'Yolo');
  });

  test('terminal shows boot sequence', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    await expectPageContains(page, 'Claude Code Stream');
    await expectPageContains(page, 'Awaiting category selection');
  });

  test('D-pad navigates cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    await dpadDown(page);
    await dpadDown(page);
    await dpadUp(page);
  });

  test('clicking Feature card navigates to Level 2', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level1');

    await clickCard(page, 'Feature');
    await page.waitForTimeout(500);

    // Level 2 should show the Suggestions palette
    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('SUGGESTIONS');
  });
});

test.describe('Level 2 Screen (Suggestions)', () => {
  test('renders with suggestion cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level2');

    const titles = await getCardTitles(page);
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  test('shows Claude Code Stream header', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level2');

    await expectPageContains(page, 'Claude Code Stream');
  });

  test('has ActionPalette with Suggestions title', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level2');

    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('SUGGESTIONS');
  });

  test('X button toggles modifier', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level2');
    await page.waitForTimeout(500);

    await pressX(page);
    await page.waitForTimeout(200);
  });
});

test.describe('Level 3 Screen (Plan Confirmation)', () => {
  test('renders with plan review cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level3');

    await expectCard(page, 'Ship It');
    await expectCard(page, 'Nah, Go Back');
    await expectCard(page, 'Tell Me More');
    await expectCard(page, 'Ship It Unhinged');
  });

  test('shows Claude Code Stream header', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level3');

    await expectPageContains(page, 'Claude Code Stream');
  });

  test('clicking Tell Me More expands plan', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level3');

    await clickCard(page, 'Tell Me More');
    await page.waitForTimeout(300);

    // Without plan data loaded, shows fallback message
    await expectPageContains(page, 'No additional details');
  });

  test('clicking Nah Go Back navigates to Level 2', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'level3');

    await clickCard(page, 'Nah, Go Back');
    await page.waitForTimeout(500);

    // Should be on Level 2
    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('SUGGESTIONS');
  });
});
