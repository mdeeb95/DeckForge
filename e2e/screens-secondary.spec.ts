import { test, expect } from '@playwright/test';
import {
  waitForApp,
  goToScreen,
  pressA,
  pressB,
  pressX,
  pressY,
  dpadDown,
  dpadUp,
  clickCard,
  expectCard,
  expectPageContains,
  expectHeading,
  getCardTitles,
  getPaletteTitle,
} from './helpers';

test.describe('Project Select Screen', () => {
  test('renders with heading', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'project_select');

    await expectHeading(page, 'Select a Project');
  });

  test('shows DeckForge branding', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'project_select');

    await expectPageContains(page, 'DeckForge');
  });
});

test.describe('AI Working Screen', () => {
  test('renders with working state', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    await expectHeading(page, 'AI Working');
  });

  test('shows interrupt button', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    await expectCard(page, 'Interrupt');
  });

  test('clicking Interrupt navigates away', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'ai_working');

    // AI Working's B card is "Interrupt" which navigates to level1
    await clickCard(page, 'Interrupt');
    await page.waitForTimeout(500);

    // Should navigate to Level 1
    await expectCard(page, 'Feature');
  });
});

test.describe('QA Mode Screen', () => {
  test('renders with correct title and cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'qa_mode');

    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('QA REVIEW');

    await expectCard(page, 'Approve and Commit');
    await expectCard(page, 'Reject Changes');
    await expectCard(page, 'Run Tests Again');
    await expectCard(page, 'View Full Diff');
  });

  test('shows Claude Code Stream header', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'qa_mode');

    await expectPageContains(page, 'Claude Code Stream');
  });

  test('clicking Reject Changes navigates to Level 1', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'qa_mode');

    await clickCard(page, 'Reject Changes');
    await page.waitForTimeout(500);

    // Should be on Level 1
    await expectCard(page, 'Feature');
  });

  test('D-pad navigates cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'qa_mode');

    await dpadDown(page);
    await dpadDown(page);
    await dpadUp(page);
  });
});

test.describe('Deploy Mode Screen', () => {
  test('renders with correct title and cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'deploy_mode');

    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('DEPLOY');

    await expectCard(page, 'Push and Deploy');
    await expectCard(page, 'Preview Deploy');
    await expectCard(page, 'Push Only');
    await expectCard(page, 'Review Changes');
  });

  test('shows Claude Code Stream header', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'deploy_mode');

    await expectPageContains(page, 'Claude Code Stream');
  });

  test('D-pad navigates cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'deploy_mode');

    await dpadDown(page);
    await dpadDown(page);
    await dpadDown(page);
    await dpadUp(page);
  });
});
