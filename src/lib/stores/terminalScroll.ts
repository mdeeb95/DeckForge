// Direct DOM reference for terminal scroll control.
// Avoids store reactivity issues with continuous analog input.

let scrollEl: HTMLElement | null = null;

export function setTerminalScrollElement(el: HTMLElement | null) {
  scrollEl = el;
}

export function scrollTerminal(delta: number) {
  if (scrollEl) {
    scrollEl.scrollTop += delta;
  }
}
