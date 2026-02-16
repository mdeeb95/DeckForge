import { get } from 'svelte/store';
import { selectedCardIndex, screenCards } from '../stores/app';
import { playNav, playClick } from '../audio/sfx';
import { devLog } from '../utils/devLog';

export function navigateUp() {
  const current = get(selectedCardIndex);
  const cards = get(screenCards);
  if (current > 0) {
    const next = current - 1;
    devLog('input', `D-pad UP: selectedCardIndex ${current} → ${next} (${cards.length} cards)`);
    selectedCardIndex.set(next);
    playNav();
  }
}

export function navigateDown() {
  const current = get(selectedCardIndex);
  const cards = get(screenCards);
  if (current < cards.length - 1) {
    const next = current + 1;
    devLog('input', `D-pad DOWN: selectedCardIndex ${current} → ${next} (${cards.length} cards)`);
    selectedCardIndex.set(next);
    playNav();
  }
}

export function activateSelected() {
  const current = get(selectedCardIndex);
  const cards = get(screenCards);
  const card = cards[current];
  devLog('input', `Activate selected [${current}]: ${card ? card.title : 'NO CARD'}`, { hasOnclick: !!card?.onclick });
  if (card?.onclick) {
    playClick();
    card.onclick();
  }
}

export function activateByButton(button: string) {
  const cards = get(screenCards);
  const card = cards.find(c => c.button === button);
  devLog('input', `Activate button ${button}: ${card ? card.title : 'NO CARD FOUND'}`, { hasOnclick: !!card?.onclick });
  if (card?.onclick) {
    playClick();
    card.onclick();
  }
}

export function cycleSelectedIndex() {
  const current = get(selectedCardIndex);
  const cards = get(screenCards);
  if (cards.length === 0) return;
  const next = (current + 1) % cards.length;
  devLog('input', `Cycle index: ${current} → ${next} (${cards.length} cards)`);
  selectedCardIndex.set(next);
}
