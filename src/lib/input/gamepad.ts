import { writable } from 'svelte/store';
import { devLog } from '../utils/devLog';

export const gamepadConnected = writable(false);
export const lastButton = writable('');

// Standard gamepad button indices → semantic names
const BUTTON_MAP: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'SELECT',
  9: 'START',
  10: 'L_STICK_CLICK',
  11: 'R_STICK_CLICK',
  12: 'DPAD_UP',
  13: 'DPAD_DOWN',
  14: 'DPAD_LEFT',
  15: 'DPAD_RIGHT',
  16: 'L4',
  17: 'R4',
  18: 'L5',
  19: 'R5',
};

const LB_INDEX = 4;

const R_STICK_Y_INDEX = 3;
const STICK_DEADZONE = 0.15;

let animFrameId: number | null = null;
let handler: ((button: string) => void) | null = null;
let analogHandler: ((axis: string, value: number) => void) | null = null;
let prevButtonStates: boolean[] = [];
let lbHeld = false;
let lbComboFired = false;

function pollGamepad() {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0] ?? gamepads[1] ?? gamepads[2] ?? gamepads[3];

  if (gp) {
    const currentStates = gp.buttons.map(b => b.pressed);

    // Check LB state
    const lbPressed = currentStates[LB_INDEX] ?? false;
    const lbWasPressed = prevButtonStates[LB_INDEX] ?? false;

    // LB just pressed — start tracking
    if (lbPressed && !lbWasPressed) {
      lbHeld = true;
      lbComboFired = false;
    }

    // Check all other buttons for edge-detected presses
    for (let i = 0; i < currentStates.length; i++) {
      if (i === LB_INDEX) continue;
      const name = BUTTON_MAP[i];
      if (!name) continue;

      const pressed = currentStates[i];
      const wasPressed = prevButtonStates[i] ?? false;

      if (pressed && !wasPressed) {
        // Edge detected: button just pressed
        if (lbHeld) {
          // Emit combo
          const comboName = `LB_${name}`;
          devLog('input', `Gamepad button ${i} pressed (${comboName})`);
          lastButton.set(comboName);
          handler?.(comboName);
          lbComboFired = true;
        } else {
          devLog('input', `Gamepad button ${i} pressed (${name})`);
          lastButton.set(name);
          handler?.(name);
        }
      }
    }

    // LB just released
    if (!lbPressed && lbWasPressed) {
      if (!lbComboFired) {
        // Standalone LB press
        devLog('input', `Gamepad button ${LB_INDEX} pressed (LB standalone)`);
        lastButton.set('LB');
        handler?.('LB');
      }
      lbHeld = false;
      lbComboFired = false;
    }

    prevButtonStates = currentStates;

    // Analog stick axes (continuous, not edge-detected)
    if (analogHandler && gp.axes.length > R_STICK_Y_INDEX) {
      const rStickY = gp.axes[R_STICK_Y_INDEX];
      if (Math.abs(rStickY) > STICK_DEADZONE) {
        analogHandler('R_STICK_Y', rStickY);
      }
    }
  }

  animFrameId = requestAnimationFrame(pollGamepad);
}

export function startGamepadPolling(
  inputHandler: (button: string) => void,
  analogInputHandler?: (axis: string, value: number) => void,
) {
  handler = inputHandler;
  analogHandler = analogInputHandler ?? null;
  prevButtonStates = [];
  lbHeld = false;
  lbComboFired = false;

  window.addEventListener('gamepadconnected', onGamepadConnected);
  window.addEventListener('gamepaddisconnected', onGamepadDisconnected);

  // Start polling immediately (getGamepads() returns null entries until polled)
  animFrameId = requestAnimationFrame(pollGamepad);
}

export function stopGamepadPolling() {
  handler = null;
  analogHandler = null;
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  window.removeEventListener('gamepadconnected', onGamepadConnected);
  window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
}

function onGamepadConnected() {
  devLog('input', 'Gamepad connected');
  gamepadConnected.set(true);
}

function onGamepadDisconnected() {
  devLog('input', 'Gamepad disconnected');
  gamepadConnected.set(false);
  prevButtonStates = [];
  lbHeld = false;
  lbComboFired = false;
}
