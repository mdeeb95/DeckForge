# Prompt 17: Input Glyph System — Environment-Aware Button Hints

## Goal
Add a dynamic input glyph system that detects whether the user is on gamepad or keyboard and swaps ALL button labels/hints across the entire UI accordingly. Like how PC games switch between Xbox/PlayStation/keyboard icons based on the last input device used.

## How It Should Work

**Detection logic — track "last input source":**
- If the last input came from `pollGamepad()` in `gamepad.ts` → mode = `gamepad`
- If the last input came from the `keydown` handler in `App.svelte` → mode = `keyboard`
- On app start: default to `gamepad` if `navigator.getGamepads()` returns a connected pad, otherwise `keyboard`
- Switching is instant — the moment you press a keyboard key, all labels flip to keyboard. The moment a gamepad button fires, they flip back. No delay, no debounce.

## New Files

### `src/lib/input/inputMode.ts` — The input mode store + glyph resolver

```
// Reactive store
export const inputMode = writable<'gamepad' | 'keyboard'>('gamepad');

// Glyph map: semantic button name → display label per mode
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

// Resolver function — components call this reactively
export function glyph(semanticButton: string): string {
  // Read current inputMode from store, look up in GLYPH_MAP
  // If no mapping found, return the raw semantic name as fallback
}

// Helper for LB combos: glyph('LB_X') → "Shift+Q" or "LB+X"
// Parse the LB_ prefix, resolve both halves, join with "+"
```

**Important:** The `glyph()` function must be reactive. Components using it inside `$derived` blocks will auto-update when `inputMode` changes. Alternatively, export a derived store `glyphMap` that recalculates on mode change, and components can read `$glyphMap['A']` directly — pick whichever pattern is cleaner in Svelte 5.

## Files to Modify

### 1. `src/lib/input/gamepad.ts`
- Import `inputMode` from `inputMode.ts`
- Inside `pollGamepad()`, whenever a button press is detected (the edge-detect block around line 68-81), set `inputMode.set('gamepad')` **before** calling the handler.
- Do this once at the top of the press detection, not per-button.

### 2. `src/App.svelte`
- Import `inputMode` from `inputMode.ts`
- In the `keydown` handler, when a key maps to a button via `keyToButton`, set `inputMode.set('keyboard')` **before** calling `handleInput()`.
- Do NOT switch to keyboard mode for debug screen-switch keys (number keys, 'p', 's') — those are dev shortcuts, not gameplay input.
- On mount: check `navigator.getGamepads()` — if any gamepad connected, set initial mode to `gamepad`, else `keyboard`.

### 3. `src/lib/components/HintGrid.svelte`
- Import `glyph` (or `glyphMap` store) from `inputMode.ts`
- Change the render: instead of displaying `hint.key` raw, display `glyph(hint.key)`
- The `hints` prop still passes semantic names (`'A'`, `'RB'`, `'D-PAD'`). The glyph resolution happens at render time inside HintGrid.
- This means **zero changes to any screen component's hint arrays.** All 15+ screens keep passing `{ key: 'A', label: 'Select' }` etc.

### 4. `src/lib/components/SecondaryCard.svelte`
- Import `glyph` from `inputMode.ts`
- Change the button badge display: instead of raw `{button}`, render `{glyph(button)}`
- The `button` prop stays semantic (`'LB'`, `'RB'`, `'R4'`). Resolution at render time.

### 5. `src/lib/components/ActionCard.svelte`
- ActionCard currently doesn't visually render the `button` prop as a badge (it's used for routing only). **No change needed** unless you see a button badge rendered somewhere I missed. Double-check before skipping.

### 6. `src/lib/components/StartMenu.svelte`
- Check if the START menu renders any button hints/labels. If so, run them through `glyph()` too.

## Design Rules
- **No screen components change.** All glyph resolution happens in the 3-4 shared components (HintGrid, SecondaryCard, StartMenu). Screens keep passing semantic names.
- The `keyToButton` map in App.svelte is the **source of truth** for keyboard bindings. The `GLYPH_MAP` in inputMode.ts must match it exactly. If `Enter` maps to `A` in keyToButton, then `GLYPH_MAP.A.keyboard` must be `'Enter'`.
- Keyboard labels should use user-friendly names: `Enter` not `Return`, `Esc` not `Escape`, `Tab` not `\t`, `Shift` not `ShiftLeft`. Arrows use the unicode arrows (`↑↓←→`) in both modes since they're the same physical concept.
- Switching is instantaneous. No transition animation on the text change — it just swaps.
- If a button has no keyboard equivalent (like `LT`/`RT` which aren't mapped in keyToButton), show the gamepad name in both modes as a fallback, or hide the hint entirely in keyboard mode. Your call — pick whichever looks cleaner.

## What NOT To Do
- Don't add PS controller support yet. Just gamepad (Xbox layout / Steam Deck) and keyboard.
- Don't change the input routing logic at all. `handleInput()` still receives semantic names (`'A'`, `'RB'`). The glyph system is display-only.
- Don't add a settings toggle for this. It's fully automatic based on last input.
- Don't touch the `BUTTON_MAP` in gamepad.ts — that maps gamepad API indices to semantic names and is unrelated to display.

## Verification
- Launch on desktop with no gamepad → all hints should show keyboard labels (`Enter`, `Esc`, `Q`, `E`, `Tab`, etc.)
- Plug in a gamepad and press any button → all hints flip to gamepad labels (`A`, `B`, `X`, `Y`, `RB`, etc.)
- Press a keyboard key → flips back to keyboard labels
- Check every screen (L1, L2, L3, AI Working, QA, History, Settings, etc.) — hints should all resolve correctly
- SecondaryCards (LB, RB, R4 badges) should also flip
- No regressions in input handling — gamepad and keyboard input still work identically
