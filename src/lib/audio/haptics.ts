// ─── Haptic Feedback — Gamepad Vibration API ─────────────────────────
// Fire-and-forget patterns. Silent no-op if no gamepad or no actuator.
// Uses 'dual-rumble' effect with weakMagnitude (high-freq) and strongMagnitude (low-freq).

function getActuator(): GamepadHapticActuator | null {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) return null;
  for (const gp of gamepads) {
    if (gp?.vibrationActuator) return gp.vibrationActuator;
  }
  return null;
}

function vibrate(duration: number, weakMagnitude: number, strongMagnitude: number): void {
  const actuator = getActuator();
  if (!actuator) return;
  (actuator as any).playEffect('dual-rumble', {
    startDelay: 0,
    duration,
    weakMagnitude,
    strongMagnitude,
  }).catch(() => {});
}

// ── Haptic patterns ──────────────────────────────────────────

/** Barely-there tick for D-pad movement */
export function hapticNav(): void {
  vibrate(20, 0.08, 0);
}

/** Light tap for card selection / A button */
export function hapticClick(): void {
  vibrate(40, 0.15, 0.08);
}

/** Soft double-tap dismiss feel for B button */
export function hapticBack(): void {
  vibrate(30, 0.12, 0.05);
  setTimeout(() => vibrate(30, 0.12, 0.05), 55);
}

/** Satisfying double-pulse for success */
export function hapticSuccess(): void {
  vibrate(50, 0.25, 0.15);
  setTimeout(() => vibrate(70, 0.25, 0.15), 80);
}

/** Harsh single buzz for errors */
export function hapticError(): void {
  vibrate(120, 0.4, 0.3);
}

/** Triple escalating pulses for Ship It moment */
export function hapticShipIt(): void {
  vibrate(30, 0.15, 0.08);
  setTimeout(() => vibrate(50, 0.25, 0.15), 60);
  setTimeout(() => vibrate(80, 0.4, 0.3), 140);
}

/** Quick snap for screenshot capture */
export function hapticCapture(): void {
  vibrate(25, 0.2, 0.1);
}

/** Tiny pop for toggles and mode switches */
export function hapticToggle(): void {
  vibrate(15, 0.06, 0);
}

/** Three rapid taps matching the reroll SFX */
export function hapticReroll(): void {
  vibrate(15, 0.1, 0.05);
  setTimeout(() => vibrate(15, 0.1, 0.05), 35);
  setTimeout(() => vibrate(15, 0.1, 0.05), 70);
}

/** Medium single tap for START menu open/close */
export function hapticMenu(): void {
  vibrate(35, 0.12, 0.06);
}
