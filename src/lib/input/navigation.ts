import { get } from 'svelte/store';
import { selectedCardIndex, screenCards } from '../stores/app';

export function navigateUp() {
  const current = get(selectedCardIndex);
  if (current > 0) {
    selectedCardIndex.set(current - 1);
  }
}

export function navigateDown() {
  const current = get(selectedCardIndex);
  const cards = get(screenCards);
  if (current < cards.length - 1) {
    selectedCardIndex.set(current + 1);
  }
}

export function activateSelected() {
  const current = get(selectedCardIndex);
  const cards = get(screenCards);
  const card = cards[current];
  if (card?.onclick) {
    card.onclick();
  }
}

export function activateByButton(button: string) {
  const cards = get(screenCards);
  const card = cards.find(c => c.button === button);
  if (card?.onclick) {
    card.onclick();
  }
}

export function cycleSelectedIndex() {
  const current = get(selectedCardIndex);
  const cards = get(screenCards);
  if (cards.length === 0) return;
  selectedCardIndex.set((current + 1) % cards.length);
}
