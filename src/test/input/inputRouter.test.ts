/**
 * Input router tests — verifies the new gamepad paradigm:
 *   A = activate highlighted card (activateSelected)
 *   B = screen-specific back action
 *   X/Y = shortcut via activateByButton (where assigned)
 *   D-pad = navigate highlight
 *   Global handlers = splitRatio, screenshot, etc.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  currentScreen,
  selectedCardIndex,
  screenCards,
  splitRatio,
  navigate,
} from '$lib/stores/app';
import { handleInput } from '$lib/input/inputRouter';

beforeEach(() => {
  navigate('level1');
  splitRatio.set(50);
  screenCards.set([
    { title: 'Feature', description: '', onclick: () => navigate('level2') },
    { title: 'Bug', description: '', onclick: () => navigate('level2') },
    { title: 'Tech Debt', description: '', onclick: () => navigate('level2') },
    { title: 'Yolo', description: '', onclick: () => navigate('level2') },
  ]);
});

describe('Level 1 input', () => {
  it('A fires the highlighted card (activateSelected)', () => {
    selectedCardIndex.set(0);
    handleInput('A');
    expect(get(currentScreen)).toBe('level2');
  });

  it('A fires whichever card is highlighted by D-pad', () => {
    selectedCardIndex.set(2);
    handleInput('A');
    expect(get(currentScreen)).toBe('level2');
  });

  it('D-pad DOWN moves selectedCardIndex', () => {
    selectedCardIndex.set(0);
    handleInput('DPAD_DOWN');
    expect(get(selectedCardIndex)).toBe(1);
  });

  it('D-pad UP moves selectedCardIndex', () => {
    selectedCardIndex.set(2);
    handleInput('DPAD_UP');
    expect(get(selectedCardIndex)).toBe(1);
  });

  it('B navigates to project_select from Level 1', () => {
    handleInput('B');
    expect(get(currentScreen)).toBe('project_select');
  });
});

describe('Level 2 input', () => {
  it('B goes back to level1', () => {
    navigate('level2');
    handleInput('B');
    expect(get(currentScreen)).toBe('level1');
  });

  it('A fires highlighted card', () => {
    navigate('level2');
    const called: string[] = [];
    screenCards.set([
      { title: 'Suggestion 1', description: '', onclick: () => called.push('first') },
      { title: 'Suggestion 2', description: '', onclick: () => called.push('second') },
    ]);
    selectedCardIndex.set(1);
    handleInput('A');
    expect(called).toEqual(['second']);
  });

  it('Y triggers reroll (no X handler on L2)', () => {
    navigate('level2');
    // X should NOT fire any card on L2 (modifier removed)
    const called: string[] = [];
    screenCards.set([
      { title: 'Suggestion 1', description: '', onclick: () => called.push('first') },
      { title: 'Reroll', description: '', onclick: () => called.push('reroll') },
    ]);
    handleInput('X');
    expect(called).toEqual([]); // X does nothing on L2
  });
});

describe('Level 3 input', () => {
  it('A fires selected card, B fires go-back card, Y fires unhinged', () => {
    const called: string[] = [];
    navigate('level3');
    screenCards.set([
      { title: 'Ship It', description: '', onclick: () => called.push('ship') },
      { button: 'B', title: 'Back', description: '', onclick: () => called.push('back') },
      { button: 'X', title: 'Expand', description: '', onclick: () => called.push('expand') },
      { button: 'Y', title: 'Unhinged', description: '', onclick: () => called.push('unhinged') },
    ]);
    selectedCardIndex.set(0);
    handleInput('A');
    handleInput('B');
    handleInput('Y');
    expect(called).toEqual(['ship', 'back', 'unhinged']);
  });
});

describe('AI Working input', () => {
  it('A fires highlighted card (activateSelected)', () => {
    const called: string[] = [];
    navigate('ai_working');
    screenCards.set([
      { title: 'Continue', description: '', onclick: () => called.push('continue') },
      { button: 'B', title: 'Interrupt', description: '', onclick: () => called.push('interrupt') },
    ]);
    selectedCardIndex.set(0);
    handleInput('A');
    expect(called).toEqual(['continue']);
  });

  it('B fires activateByButton for interrupt', () => {
    const called: string[] = [];
    navigate('ai_working');
    screenCards.set([
      { title: 'Continue', description: '', onclick: () => called.push('continue') },
      { button: 'B', title: 'Interrupt', description: '', onclick: () => called.push('interrupt') },
    ]);
    handleInput('B');
    expect(called).toEqual(['interrupt']);
  });
});

describe('QA Mode input', () => {
  it('A fires highlighted, B navigates back to level1', () => {
    const called: string[] = [];
    navigate('qa_mode');
    screenCards.set([
      { title: 'Approve', description: '', onclick: () => called.push('approve') },
      { title: 'Reject', description: '', onclick: () => called.push('reject') },
      { button: 'X', title: 'Test', description: '', onclick: () => called.push('test') },
      { button: 'Y', title: 'Diff', description: '', onclick: () => called.push('diff') },
    ]);
    selectedCardIndex.set(0);
    handleInput('A');
    expect(called).toEqual(['approve']);
    // B navigates back — safe, no revert
    handleInput('B');
    expect(get(currentScreen)).toBe('level1');
  });

  it('X/Y fire shortcut cards', () => {
    const called: string[] = [];
    navigate('qa_mode');
    screenCards.set([
      { title: 'Approve', description: '', onclick: () => called.push('approve') },
      { title: 'Reject', description: '', onclick: () => called.push('reject') },
      { button: 'X', title: 'Test', description: '', onclick: () => called.push('test') },
      { button: 'Y', title: 'Diff', description: '', onclick: () => called.push('diff') },
    ]);
    handleInput('X');
    handleInput('Y');
    expect(called).toEqual(['test', 'diff']);
  });
});

describe('Global handlers', () => {
  it('LB_DPAD_LEFT decreases splitRatio by 5', () => {
    splitRatio.set(50);
    handleInput('LB_DPAD_LEFT');
    expect(get(splitRatio)).toBe(45);
  });

  it('LB_DPAD_RIGHT increases splitRatio by 5', () => {
    splitRatio.set(50);
    handleInput('LB_DPAD_RIGHT');
    expect(get(splitRatio)).toBe(55);
  });

  it('LB_DPAD_LEFT clamps at 20', () => {
    splitRatio.set(20);
    handleInput('LB_DPAD_LEFT');
    expect(get(splitRatio)).toBe(20);
  });

  it('LB_DPAD_RIGHT clamps at 80', () => {
    splitRatio.set(80);
    handleInput('LB_DPAD_RIGHT');
    expect(get(splitRatio)).toBe(80);
  });

  it('unknown buttons do not throw', () => {
    expect(() => handleInput('BANANA')).not.toThrow();
  });
});
