// ─── Sound Effects — Pre-generated audio files ──────────────────────
// Generated via ElevenLabs. Loaded once, played on demand via HTMLAudioElement pool.

// Import audio file paths (Vite handles these as static assets)
import navSrc from '../../assets/sfx/nav.mp3';
import clickSrc from '../../assets/sfx/click.mp3';
import successSrc from '../../assets/sfx/success.mp3';
import errorSrc from '../../assets/sfx/error.mp3';
import backSrc from '../../assets/sfx/back.mp3';
import captureSrc from '../../assets/sfx/capture.mp3';
import toggleSrc from '../../assets/sfx/toggle.mp3';
import menuOpenSrc from '../../assets/sfx/menu-open.mp3';
import menuCloseSrc from '../../assets/sfx/menu-close.mp3';
import rerollSrc from '../../assets/sfx/reroll.mp3';
import shipItSrc from '../../assets/sfx/ship-it.mp3';

// Audio pool: pre-create multiple Audio elements per sound so rapid
// re-triggers don't cut off the previous play. Pool size of 3 is enough
// for UI sounds (nav might fire rapidly on D-pad hold).
function createPool(src: string, size = 3): HTMLAudioElement[] {
  return Array.from({ length: size }, () => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    return audio;
  });
}

// Pool index tracking per sound
const pools: Record<string, { elements: HTMLAudioElement[]; index: number }> = {};

function initPool(name: string, src: string, size = 3) {
  pools[name] = { elements: createPool(src, size), index: 0 };
}

function play(name: string, volume = 1.0): void {
  const pool = pools[name];
  if (!pool) return;
  const audio = pool.elements[pool.index];
  pool.index = (pool.index + 1) % pool.elements.length;
  audio.volume = volume;
  audio.currentTime = 0;
  const result = audio.play();
  if (result?.catch) result.catch(() => {}); // Swallow autoplay restrictions
}

// Initialize all pools on module load
initPool('nav', navSrc, 4);      // Extra pool for rapid D-pad
initPool('click', clickSrc);
initPool('success', successSrc);
initPool('error', errorSrc);
initPool('back', backSrc);
initPool('capture', captureSrc);
initPool('toggle', toggleSrc);
initPool('menuOpen', menuOpenSrc);
initPool('menuClose', menuCloseSrc);
initPool('reroll', rerollSrc);
initPool('shipIt', shipItSrc);

// ─── Public API ──────────────────────────────────────────────
// Haptics are paired with each sound function (one call = sound + vibration).

import { hapticNav, hapticClick, hapticSuccess, hapticError, hapticBack,
         hapticCapture, hapticToggle, hapticReroll, hapticMenu } from './haptics';

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
