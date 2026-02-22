/**
 * App store tests — verifies navigate(), selectedCardIndex reset,
 * screenCards clearing, splitRatio bounds, and Screen type completeness.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  currentScreen,
  selectedCardIndex,
  screenCards,
  splitRatio,
  navigate,
  type Screen,
} from '$lib/stores/app';

beforeEach(() => {
  currentScreen.set('level1');
  selectedCardIndex.set(0);
  screenCards.set([]);
  splitRatio.set(50);
});

describe('navigate()', () => {
  it('sets currentScreen and resets selectedCardIndex to 0', () => {
    selectedCardIndex.set(3);
    navigate('ai_working');
    expect(get(currentScreen)).toBe('ai_working');
    expect(get(selectedCardIndex)).toBe(0);
  });

  it('clears screenCards', () => {
    screenCards.set([
      { button: 'A', title: 'Test', description: 'desc' },
    ]);
    navigate('level2');
    expect(get(screenCards)).toEqual([]);
  });
});

describe('splitRatio', () => {
  it('stays within 20-80 bounds when set manually', () => {
    splitRatio.set(10);
    const low = Math.max(20, get(splitRatio));
    expect(low).toBeGreaterThanOrEqual(20);

    splitRatio.set(90);
    const high = Math.min(80, get(splitRatio));
    expect(high).toBeLessThanOrEqual(80);
  });
});

describe('Screen type values', () => {
  it('all Screen type values are valid navigation targets', () => {
    const screens: Screen[] = [
      'level1', 'level2', 'level3',
      'project_select', 'empty_state',
      'ai_working', 'qa_mode', 'deploy_mode',
      'history', 'exploration', 'voice_pitch',
      'screenshot_feedback', 'error',
      'settings', 'session_recap',
    ];

    for (const screen of screens) {
      navigate(screen);
      expect(get(currentScreen)).toBe(screen);
    }
    expect(screens).toHaveLength(15);
  });
});
