# Prompt: Haptic Feedback System

## Goal
Add gamepad haptic feedback (rumble) paired with the existing SFX system. Every sound in `sfx.ts` gets a matching vibration pattern. Light taps for navigation, satisfying thumps for Ship It, error buzzes for failures.

## Context
- Steam Deck and Xbox controllers support the Gamepad API's `vibrationActuator.playEffect()`.
- DeckForge already has 4 procedural SFX in `src/lib/audio/sfx.ts`: `playClick()`, `playSuccess()`, `playError()`, `playNav()`.
- `gamepadConnected` store in `src/lib/input/gamepad.ts` tracks connection state.
- Zero haptic code exists today.

## New File

### `src/lib/audio/haptics.ts` — Haptic feedback engine

```
import { get } from 'svelte/store';
import { gamepadConnected } from '../input/gamepad';

// Get the first connected gamepad's vibration actuator
function getActuator(): GamepadHapticActuator | null {
  // Check navigator.getGamepads(), find first with vibrationActuator
  // Return null if no gamepad connected or no actuator available
}

// Haptic patterns — each matches an SFX function
export function hapticNav(): void {
  // Very light, very short — user presses D-pad
  // duration: 30ms, weakMagnitude: 0.1, strongMagnitude: 0
  // This should feel like a subtle tick, not a rumble
}

export function hapticClick(): void {
  // Light tap — user selects a card with A
  // duration: 50ms, weakMagnitude: 0.2, strongMagnitude: 0.1
}

export function hapticSuccess(): void {
  // Satisfying double-pulse — Ship It confirmed, auto-fix succeeded
  // Two pulses: 60ms on, 40ms gap, 80ms on
  // weakMagnitude: 0.3, strongMagnitude: 0.2
  // Use setTimeout for the gap between pulses
}

export function hapticError(): void {
  // Harsh buzz — error, crash detected, auto-fix exhausted
  // duration: 150ms, weakMagnitude: 0.5, strongMagnitude: 0.4
  // Should feel distinctly different from success — longer, stronger, no rhythm
}

export function hapticShipIt(): void {
  // The big one — Ship It / Ship It Unhinged
  // Triple escalating pulse: 40ms → 60ms → 100ms, increasing magnitude
  // This is the moment. Make it feel like launching something.
}

// All functions silently no-op if:
// - No gamepad connected
// - Actuator not available (keyboard mode, unsupported controller)
// - vibrationActuator.playEffect() throws (catch and swallow)
```

**Important:** `playEffect('dual-rumble', { ... })` is the standard API. The `GamepadHapticActuator` type may need a `declare` or type assertion since TypeScript's lib types lag behind the spec. Use `(actuator as any).playEffect(...)` if needed — don't fight the types here.

## Files to Modify

### 1. `src/lib/audio/sfx.ts`
- Import all haptic functions from `haptics.ts`
- Inside each SFX function, call the matching haptic **after** the audio plays:
  - `playNav()` → add `hapticNav()`
  - `playClick()` → add `hapticClick()`
  - `playSuccess()` → add `hapticSuccess()`
  - `playError()` → add `hapticError()`
- This means haptics are always paired with audio. No separate call sites needed.

### 2. `src/lib/screens/Level3Screen.svelte`
- In the `shipIt()` function (and `shipIt(true)` for Unhinged), call `hapticShipIt()` directly.
- This is the one haptic that doesn't pair with an existing SFX — it's its own event.
- Import `hapticShipIt` from `haptics.ts`.

### 3. `src/lib/screens/AIWorkingScreen.svelte`
- When auto-fix phase transitions to `'success'` → `hapticSuccess()` (already fires via `playSuccess()` if that's called — check and add if not).
- When auto-fix phase transitions to `'exhausted'` → `hapticError()` (same check).

## Design Rules
- **Haptics are always paired with audio, never standalone** (except `hapticShipIt`). This means if someone later adds a new SFX, they just add a matching haptic in the same pattern.
- **All functions are fire-and-forget.** No awaiting, no error handling beyond a try-catch that swallows.
- **No settings toggle yet.** If someone doesn't want haptics, they can disable controller vibration at the OS level. We can add a toggle later if needed.
- **Keyboard mode = no haptics.** The `getActuator()` check handles this naturally since there's no gamepad.

## What NOT To Do
- Don't add haptics to D-pad navigation in the input router — let `playNav()` handle it via the SFX pairing.
- Don't use the older `gamepad.hapticActuators` array (deprecated). Use `gamepad.vibrationActuator` (singular).
- Don't make haptic intensity configurable yet. Get the feel right with hardcoded values first.

## Verification
- With a gamepad connected: navigate with D-pad (light tick), press A (tap), Ship It (triple pulse), trigger an error (buzz).
- With no gamepad: confirm zero console errors, all SFX still play normally.
- On keyboard: confirm no haptic calls fire (silent no-op).
