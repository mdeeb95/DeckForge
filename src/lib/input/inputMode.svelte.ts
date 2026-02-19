// Input mode store — tracks whether last input was gamepad or keyboard
// Components call glyph() in templates for automatic reactive resolution

let mode = $state<'gamepad' | 'keyboard'>('gamepad');

// Glyph map: semantic button name → display label per mode
// Keyboard labels must match keyToButton in App.svelte
const GLYPH_MAP: Record<string, { gamepad: string; keyboard: string }> = {
  A:          { gamepad: 'A',       keyboard: 'Enter' },
  B:          { gamepad: 'B',       keyboard: 'Esc' },
  X:          { gamepad: 'X',       keyboard: 'Q' },
  Y:          { gamepad: 'Y',       keyboard: 'E' },
  DPAD_UP:    { gamepad: '↑',       keyboard: '↑' },
  DPAD_DOWN:  { gamepad: '↓',       keyboard: '↓' },
  DPAD_LEFT:  { gamepad: '←',       keyboard: '←' },
  DPAD_RIGHT: { gamepad: '→',       keyboard: '→' },
  'D-PAD':    { gamepad: 'D-PAD',   keyboard: 'Arrows' },
  LB:         { gamepad: 'LB',      keyboard: 'Shift' },
  RB:         { gamepad: 'RB',      keyboard: 'Tab' },
  LT:         { gamepad: 'LT',      keyboard: 'LT' },
  RT:         { gamepad: 'RT',      keyboard: 'RT' },
  SELECT:     { gamepad: 'SELECT',  keyboard: 'V' },
  START:      { gamepad: 'START',   keyboard: 'M' },
  R4:         { gamepad: 'R4',      keyboard: 'R' },
  L4:         { gamepad: 'L4',      keyboard: 'F1' },
  R5:         { gamepad: 'R5',      keyboard: 'F4' },
  L5:         { gamepad: 'L5',      keyboard: 'F3' },
};

export const inputMode = {
  get current() { return mode; },
  set(value: 'gamepad' | 'keyboard') { mode = value; },
};

/** Resolve a semantic button name to a display label based on current input mode.
 *  Handles LB_ combos: glyph('LB_X') → "Shift+Q" (keyboard) or "LB+X" (gamepad) */
export function glyph(semanticButton: string): string {
  if (semanticButton.startsWith('LB_')) {
    const suffix = semanticButton.slice(3);
    const lbLabel = GLYPH_MAP['LB']?.[mode] ?? 'LB';
    const suffixLabel = GLYPH_MAP[suffix]?.[mode] ?? suffix;
    return `${lbLabel}+${suffixLabel}`;
  }
  return GLYPH_MAP[semanticButton]?.[mode] ?? semanticButton;
}
