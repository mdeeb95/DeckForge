/**
 * Input router tests — verifies that button presses on each screen
 * trigger correct navigation, and that global handlers adjust splitRatio.
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
    { button: 'A', title: 'a', description: '', onclick: () => navigate('level2') },
    { button: 'B', title: 'b', description: '', onclick: () => navigate('level2') },
    { button: 'X', title: 'x', description: '', onclick: () => navigate('level2') },
    { button: 'Y', title: 'y', description: '', onclick: () => navigate('level2') },
  ]);
});

describe('Level 1 input', () => {
  it('A/B/X/Y buttons trigger navigation to level2', () => {
    for (const button of ['A', 'B', 'X', 'Y']) {
      navigate('level1');
      screenCards.set([
        { button, title: 't', description: '', onclick: () => navigate('level2') },
      ]);
      handleInput(button);
      expect(get(currentScreen)).toBe('level2');
    }
  });
});

describe('Level 2 input', () => {
  it('LB goes back to level1', () => {
    navigate('level2');
    handleInput('LB');
    expect(get(currentScreen)).toBe('level1');
  });
});

describe('Level 3 input', () => {
  it('A navigates to ai_working', () => {
    navigate('level3');
    handleInput('A');
    expect(get(currentScreen)).toBe('ai_working');
  });

  it('B goes back to level2', () => {
    navigate('level3');
    handleInput('B');
    expect(get(currentScreen)).toBe('level2');
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
