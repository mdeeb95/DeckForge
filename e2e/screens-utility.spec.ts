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

test.describe('History Screen', () => {
  test('renders with timeline', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'history');

    await expectHeading(page, 'History');
  });

  test('shows preview and rollback cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'history');

    await expectCard(page, 'Preview Commit');
    await expectCard(page, 'Rollback to Here');
  });

  test('shows Claude Code Stream header', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'history');

    await expectPageContains(page, 'Claude Code Stream');
  });
});

test.describe('Exploration Screen', () => {
  test('renders with correct title and cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'exploration');

    const title = await getPaletteTitle(page);
    expect(title.toUpperCase()).toContain('EXPLORE');

    await expectCard(page, 'Ask a Question');
    await expectCard(page, 'Go Back');
    await expectCard(page, 'New Topic');
    await expectCard(page, 'Surprise Me');
  });

  test('terminal shows exploration intro', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'exploration');

    await expectPageContains(page, 'Exploration Mode');
  });

  test('clicking Ask a Question adds terminal entry', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'exploration');

    await clickCard(page, 'Ask a Question');

    await expectPageContains(page, 'not yet implemented');
  });

  test('clicking Go Back navigates to project select', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'exploration');

    await clickCard(page, 'Go Back');

    await expectHeading(page, 'Select a Project');
  });

  test('clicking New Topic adds terminal entry', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'exploration');

    await clickCard(page, 'New Topic');

    await expectPageContains(page, 'not yet implemented');
  });

  test('clicking Surprise Me adds terminal entry', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'exploration');

    await clickCard(page, 'Surprise Me');
    await page.waitForTimeout(300);
  });
});

test.describe('Voice Pitch Screen', () => {
  test('renders with voice input heading', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'voice_pitch');

    await expectHeading(page, 'Voice Input');
  });

  test('shows recording controls', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'voice_pitch');

    await expectCard(page, 'Start Recording');
    await expectCard(page, 'Back');
  });

  test('clicking Back navigates away', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'voice_pitch');

    await clickCard(page, 'Back');
    await page.waitForTimeout(300);
  });
});

test.describe('Error Screen', () => {
  test('renders with error recovery cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'error');

    await expectPageContains(page, 'Error Recovery');

    await expectCard(page, 'Retry with Fix');
    await expectCard(page, 'Undo and Go Back');
    await expectCard(page, 'View Error Details');
    await expectCard(page, 'Ignore and Continue');
  });

  test('terminal shows error details', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'error');

    await expectPageContains(page, 'TypeScript compilation failed');
  });

  test('clicking View Error Details expands error', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'error');

    await clickCard(page, 'View Error Details');

    await expectPageContains(page, 'EXPANDED ERROR');
  });

  test('clicking Ignore and Continue navigates to Level 1', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'error');

    await clickCard(page, 'Ignore and Continue');

    // Should be on Level 1
    await expectCard(page, 'Feature');
  });

  test('D-pad navigates cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'error');

    await dpadDown(page);
    await dpadDown(page);
    await dpadUp(page);
  });
});

test.describe('Screenshot Feedback Screen', () => {
  test('renders with screenshot UI', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'screenshot_feedback');

    await expectHeading(page, 'Screenshot Captured');
  });

  test('shows all action cards', async ({ page }) => {
    await waitForApp(page);
    await goToScreen(page, 'screenshot_feedback');

    await expectCard(page, 'Send to Claude');
    await expectCard(page, 'Discard');
    await expectCard(page, 'Voice Annotate');
    await expectCard(page, 'Send + New Task');
  });
});
