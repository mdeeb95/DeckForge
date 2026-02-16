/**
 * Navigation tests — verifies navigateUp/Down clamping,
 * activateByButton dispatch, and cycleSelectedIndex wrap-around.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { selectedCardIndex, screenCards } from '$lib/stores/app';
import {
  navigateUp,
  navigateDown,
  activateByButton,
  cycleSelectedIndex,
} from '$lib/input/navigation';

beforeEach(() => {
  selectedCardIndex.set(0);
  screenCards.set([
    { button: 'A', title: 'First', description: '' },
    { button: 'B', title: 'Second', description: '' },
    { button: 'X', title: 'Third', description: '' },
  ]);
});

describe('navigateUp()', () => {
  it('decrements selectedCardIndex', () => {
    selectedCardIndex.set(2);
    navigateUp();
    expect(get(selectedCardIndex)).toBe(1);
  });

  it('stops at 0', () => {
    selectedCardIndex.set(0);
    navigateUp();
    expect(get(selectedCardIndex)).toBe(0);
  });
});

describe('navigateDown()', () => {
  it('increments selectedCardIndex', () => {
    selectedCardIndex.set(0);
    navigateDown();
    expect(get(selectedCardIndex)).toBe(1);
  });

  it('stops at max (cards.length - 1)', () => {
    selectedCardIndex.set(2);
    navigateDown();
    expect(get(selectedCardIndex)).toBe(2);
  });
});

describe('activateByButton()', () => {
  it('calls onclick of the matching card', () => {
    const handler = vi.fn();
    screenCards.set([
      { button: 'A', title: 'Test', description: '', onclick: handler },
      { button: 'B', title: 'Other', description: '' },
    ]);
    activateByButton('A');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does nothing when button has no matching card', () => {
    // Should not throw
    activateByButton('Z');
  });
});

describe('cycleSelectedIndex()', () => {
  it('wraps around to 0 after reaching the end', () => {
    selectedCardIndex.set(2);
    cycleSelectedIndex();
    expect(get(selectedCardIndex)).toBe(0);
  });

  it('increments normally when not at end', () => {
    selectedCardIndex.set(0);
    cycleSelectedIndex();
    expect(get(selectedCardIndex)).toBe(1);
  });
});
