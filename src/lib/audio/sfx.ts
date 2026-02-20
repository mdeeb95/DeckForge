// ─── Sound Effects — Rust-native via rodio ─────────────────────────
// Audio plays through Tauri's Rust backend (rodio → PipeWire/ALSA).
// No GStreamer dependency. Fire-and-forget — Rust handles concurrency.

import { invoke } from '@tauri-apps/api/core';

// Haptics stay in the frontend — Gamepad Vibration API is unrelated to GStreamer.
import { hapticNav, hapticClick, hapticSuccess, hapticError, hapticBack,
         hapticCapture, hapticToggle, hapticReroll, hapticMenu } from './haptics';

function play(name: string, volume: number): void {
  invoke('play_sound', { name, volume }).catch(() => {});
}

export function playNav(): void     { play('nav', 0.4);     hapticNav(); }
export function playClick(): void   { play('click', 0.6);   hapticClick(); }
export function playSuccess(): void { play('success', 0.8); hapticSuccess(); }
export function playError(): void   { play('error', 0.5);   hapticError(); }
export function playBack(): void    { play('back', 0.5);    hapticBack(); }
export function playCapture(): void { play('capture', 0.6); hapticCapture(); }
export function playToggle(): void  { play('toggle', 0.4);  hapticToggle(); }
export function playMenuOpen(): void  { play('menuOpen', 0.5);  hapticMenu(); }
export function playMenuClose(): void { play('menuClose', 0.4); hapticMenu(); }
export function playReroll(): void  { play('reroll', 0.6);  hapticReroll(); }
export function playShipIt(): void  { play('shipIt', 0.8); }
