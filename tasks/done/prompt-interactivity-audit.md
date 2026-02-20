# Prompt: Interactivity Audit — Full Sound + Haptic Coverage

## Goal
Ensure **every single user-initiated button press** in DeckForge produces both a sound effect AND haptic feedback. Right now ~50% of actions are completely silent. After this prompt, zero actions should be silent. The tactile feel is what makes this app fun.

## Current State

### SFX Library (`src/lib/audio/sfx.ts`)
Four synthesized sounds exist:
- `playClick()` — 50ms square wave tick (800→400Hz). Card selection, button activation.
- `playSuccess()` — 300ms two-tone chime (C5→E5). Task completion.
- `playError()` — 150ms sawtooth buzz (200→80Hz). Errors, failures.
- `playNav()` — 30ms sine tick (600Hz). D-pad movement.

### Where Sound Currently Fires
Sound lives in two places:
1. **`navigation.ts`** — `navigateUp/Down()` calls `playNav()`, `activateSelected/ByButton()` calls `playClick()`.
2. **`SecondaryCard.svelte`** — `handleClick()` calls `playClick()`.

That's it. Everything else is silent.

### Complete Gap List — Actions That Are SILENT

**B Button (Back/Cancel) — Silent on 8+ screens:**
- L2 → L1: `navigate('level1')` (inputRouter L38)
- QA Mode → L1: `navigate('level1')` (inputRouter L71)
- Deploy Mode → L1: `navigate('level1')` (inputRouter L84)
- History → L1: `navigate('level1')` (inputRouter L97)
- Screenshot Feedback → L1: `navigate('level1')` (inputRouter L155)
- Error → clear + L1: `clearError() + navigate('level1')` (inputRouter L168-172)
- Exploration → project_select: `navigate('project_select')` (inputRouter L134)
- Settings hub → previous: `navigate(previousScreen)` (inputRouter L185)
- Settings sub-screens → hub: `navigate('settings')` (inputRouter L201)

**Global Actions — All Silent:**
- RB (Screenshot capture): inputRouter L217
- SELECT (Terminal tab toggle): inputRouter L251
- LB+DPAD_LEFT/RIGHT (Split resize): inputRouter L231, L237
- RT (Switch to app window): inputRouter L243
- LT (Switch to DeckForge): inputRouter L247
- R4 (Run/restart app): inputRouter L259

**START Menu — Entirely Silent:**
- Menu open (START button): inputRouter L319
- Menu navigate (DPAD_UP/DOWN): inputRouter L308-309 → no-op, visual only
- Menu select (A → Settings): inputRouter L296
- Menu close (START/B): inputRouter L294
- Menu quit (Y): inputRouter L300
- Plus: keyboard handler in StartMenu.svelte L34-46 — all silent

**Reroll — Silent:**
- Y on L2 (reroll suggestions): inputRouter L39

**START-as-handler — Silent:**
- L1 START → QA Mode: inputRouter L21-26
- Deploy Mode START → L1: inputRouter L87
- Settings hub START → close: inputRouter L186
- Settings sub-screen START → close: inputRouter L203

## Part 0: Generate All Sound Effects with ElevenLabs MCP

**Before writing any code**, use the ElevenLabs MCP `text_to_sound_effects` tool to generate all 10 sound effects as audio files. Save them to `src/assets/sfx/`.

Generate each sound with a short, descriptive prompt. Keep all sounds **very short** (under 500ms) — these are UI sounds, not cinematic audio. Specify short durations in the prompt.

| File | ElevenLabs Prompt | Used For |
|------|-------------------|----------|
| `nav.mp3` | "Very short subtle soft UI tick click, 30 milliseconds, minimal, digital interface" | D-pad movement |
| `click.mp3` | "Short crisp digital button press click, 50 milliseconds, clean satisfying UI tap" | Card selection, A button |
| `success.mp3` | "Short ascending two-tone digital chime, success confirmation sound, 300 milliseconds, positive bright" | Task completion, plan approved |
| `error.mp3` | "Short low digital error buzz, 150 milliseconds, warning tone, descending" | Errors, failures |
| `back.mp3` | "Short soft descending two-tone dismiss sound, 150 milliseconds, gentle cancel, digital UI" | B button back/cancel |
| `capture.mp3` | "Very short camera shutter snap click, 60 milliseconds, crisp digital screenshot" | Screenshot capture |
| `toggle.mp3` | "Very short soft digital pop switch toggle, 25 milliseconds, subtle mode change" | Tab toggle, split resize, window switch |
| `menu-open.mp3` | "Short ascending digital sweep whoosh, 80 milliseconds, menu opening, UI" | START menu open |
| `menu-close.mp3` | "Short descending digital sweep, 60 milliseconds, menu closing dismiss, UI" | START menu close |
| `reroll.mp3` | "Short rapid triple click tick, slot machine dice roll, 150 milliseconds, digital" | Reroll suggestions (L2 Y button) |

If ElevenLabs generates sounds that are too long, trim them. If a sound doesn't feel right, regenerate with an adjusted prompt. **Iterate until they feel good** — these sounds define the app's personality.

Also generate one special sound:
| `ship-it.mp3` | "Short powerful digital launch confirmation, ascending with impact, 200 milliseconds, epic satisfying" | Ship It moment |

Save all files to `src/assets/sfx/`. That's 11 .mp3 files total.

## Part 1: Rewrite SFX System to Use Audio Files

### Replace `src/lib/audio/sfx.ts`

Replace the entire Web Audio API synthesis approach with pre-loaded audio file playback.

```typescript
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
  audio.play().catch(() => {}); // Swallow autoplay restrictions
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

// ─── Public API (same function signatures as before) ────────────────
// Haptics are called at the end of each function (paired).

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
```

**Volume hierarchy** (loudest → quietest): success (0.8) = shipIt (0.8) > click (0.6) = capture (0.6) = reroll (0.6) > error (0.5) = back (0.5) = menuOpen (0.5) > toggle (0.4) = nav (0.4) = menuClose (0.4). Tune these after listening.

**Vite config:** Ensure `.mp3` files are handled as static assets. Vite does this by default for imports, but verify `src/assets/sfx/` files are included in the build. You may need to add `assetsInclude: ['**/*.mp3']` to `vite.config.ts` if imports fail.

**Design principle:** Back, toggle, and menu sounds are quieter and less distinctive than click/success/error. They should feel like "system furniture" — present but not attention-grabbing.

## Part 2: New Haptics

### New file: `src/lib/audio/haptics.ts`

```typescript
// Get the first connected gamepad's vibration actuator.
// Returns null if no gamepad or no actuator (keyboard mode, unsupported controller).
function getActuator(): GamepadHapticActuator | null

// ── Haptic patterns ──────────────────────────────────────────
// All functions fire-and-forget. Silent no-op if no actuator.
// Use (actuator as any).playEffect('dual-rumble', {...}) for TS compat.

hapticNav()
  // Barely-there tick. duration: 20ms, weakMagnitude: 0.08, strongMagnitude: 0.

hapticClick()
  // Light tap. duration: 40ms, weakMagnitude: 0.15, strongMagnitude: 0.08.

hapticBack()
  // Soft double-tap (dismiss feel). 30ms on, 25ms gap, 30ms on.
  // weakMagnitude: 0.12, strongMagnitude: 0.05.

hapticSuccess()
  // Satisfying double-pulse. 50ms on, 30ms gap, 70ms on.
  // weakMagnitude: 0.25, strongMagnitude: 0.15.

hapticError()
  // Harsh single buzz. duration: 120ms, weakMagnitude: 0.4, strongMagnitude: 0.3.

hapticShipIt()
  // Triple escalating. 30ms → 50ms → 80ms, magnitudes increasing each step.
  // weakMagnitude: 0.15/0.25/0.4, strongMagnitude: 0.08/0.15/0.3.

hapticCapture()
  // Quick snap. duration: 25ms, weakMagnitude: 0.2, strongMagnitude: 0.1.

hapticToggle()
  // Tiny pop. duration: 15ms, weakMagnitude: 0.06, strongMagnitude: 0.

hapticReroll()
  // Three rapid taps (matches the SFX). 15ms each, 20ms gaps.
  // weakMagnitude: 0.1, strongMagnitude: 0.05.

hapticMenu()
  // Medium single tap. duration: 35ms, weakMagnitude: 0.12, strongMagnitude: 0.06.
```

## Part 3: Haptic + Audio Pairing

Haptics are already paired inside each `sfx.ts` function (see Part 1 rewrite above). **Components never call haptic functions directly** (except `hapticShipIt` — see below). One function call = sound + vibration.

| Function | Audio | Haptic |
|----------|-------|--------|
| `playNav()` | nav.mp3 | `hapticNav()` |
| `playClick()` | click.mp3 | `hapticClick()` |
| `playSuccess()` | success.mp3 | `hapticSuccess()` |
| `playError()` | error.mp3 | `hapticError()` |
| `playBack()` | back.mp3 | `hapticBack()` |
| `playCapture()` | capture.mp3 | `hapticCapture()` |
| `playToggle()` | toggle.mp3 | `hapticToggle()` |
| `playMenuOpen()` | menu-open.mp3 | `hapticMenu()` |
| `playMenuClose()` | menu-close.mp3 | `hapticMenu()` |
| `playReroll()` | reroll.mp3 | `hapticReroll()` |
| `playShipIt()` | ship-it.mp3 | *(none — hapticShipIt is called separately in Level3Screen)* |

## Part 4: Wire SFX to Every Silent Action

### `src/lib/input/inputRouter.ts`

Import all new SFX functions at the top.

**B-button back navigation — add `playBack()` before every `navigate()` call:**
- L2 B handler (L38): `playBack(); navigate('level1');`
- QA Mode B handler (L71): `playBack(); navigate('level1');`
- Deploy Mode B handler (L84): `playBack(); navigate('level1');`
- History B handler (L97): `playBack(); navigate('level1');`
- Screenshot Feedback B handler (L155): `playBack(); navigate('level1');`
- Exploration B handler (L134): `playBack(); navigate('project_select');`
- Settings hub B handler (L185): `playBack(); navigate(...);`
- Settings sub-screen B handler (L201): `playBack(); navigate('settings');`
- Error B handler (L168-172): `playBack();` before `clearError()`

**Global handlers — add SFX to each:**
- RB Screenshot (L217): `playCapture();` before the flash
- SELECT Terminal toggle (L251): `playToggle();` before the tab switch
- LB_DPAD_LEFT (L231): `playToggle();` before ratio change
- LB_DPAD_RIGHT (L237): `playToggle();` before ratio change
- RT Switch to app (L243): `playToggle();`
- LT Switch to DeckForge (L247): `playToggle();`
- R4 Run/restart (L259): `playClick();` (reuses existing — launching is a "do something" action)

**Reroll (L39):** `playReroll(); rerollSuggestions();`

**START-as-handler cases:**
- L1 START → QA Mode (L21-26): `playClick();` before navigate
- Deploy Mode START (L87): `playBack();` before navigate
- Settings hub START (L186): `playBack();` before navigate
- Settings sub-screen START (L203): `playBack();` before navigate

**START menu open (L319):** `playMenuOpen();` before `startMenuOpen.set(true);`

**START menu priority 2 block (L292-311):**
- START/B close (L294): `playMenuClose();` before `startMenuOpen.set(false);`
- A → Settings (L296-298): `playClick();` before navigate
- Y → Quit (L300-307): `playClick();`
- DPAD_UP/DOWN (L308-309): `playNav();` (even though visual handling is in StartMenu)

### `src/lib/components/StartMenu.svelte`

The keyboard handler in `handleMenuInput()` (L34-46) also needs sound:
- ArrowUp/ArrowDown: add `playNav();` after index change
- Enter: add `playClick();` before action
- Escape: add `playMenuClose();` before action
- q (X → About): add `playClick();`
- e (Y → Quit): add `playClick();`
- m (START → close): add `playMenuClose();`

Import the needed SFX functions at the top of StartMenu.svelte.

### `src/lib/screens/Level3Screen.svelte`

Two additions for the Ship It moment:
1. Import `playShipIt` from `sfx.ts`. Call it inside `shipIt()` (both normal and unhinged). This plays the special ship-it.mp3 sound **on top of** the `playClick()` that already fires via `activateSelected()`.
2. Import `hapticShipIt` from `haptics.ts`. Call it in the same place. This is the one haptic that doesn't pair with audio inside sfx.ts — it's the extra rumble for the big moment.

## Design Rules

- **Every button press makes a sound.** No exceptions. If a user presses a button and nothing audible happens, it's a bug.
- **Haptics always pair with audio.** The pairing happens inside `sfx.ts`, not at call sites. This keeps the architecture clean — one import, one function call, both systems fire.
- **Sound hierarchy matters.** Success is the loudest/most distinct. Nav is the quietest. Back sounds different from forward. The user should be able to close their eyes and know what they just did.
- **Don't double-fire.** If an action already gets `playClick()` via `activateSelected()` or `activateByButton()` in `navigation.ts`, don't add another `playClick()` in `inputRouter.ts`. Only add SFX for the **currently silent** paths — direct `navigate()` calls and global handlers.
- **Menu sounds are distinct from screen sounds.** `playMenuOpen/Close` should feel like "system UI" — softer, more mechanical. Not the same click as selecting a card.

## What NOT To Do
- Don't add a volume slider or mute toggle yet. Keep it simple.
- Don't keep any Web Audio API synthesis code — the old `AudioContext`/`OscillatorNode` approach is fully replaced by the ElevenLabs-generated .mp3 files.
- Don't add haptics to continuous actions (R-stick scroll, hold-to-repeat). Only edge-detected presses.
- Don't add transition sounds between screens. The B-button `playBack()` is the feedback — the screen transition itself is visual only.
- Don't generate sounds that are longer than 500ms. These are UI micro-interactions, not music.

## Verification Checklist

Test EVERY action below. Each must produce both sound and haptic (with gamepad connected):

**D-pad navigation (every screen):**
- [ ] UP → playNav() + hapticNav()
- [ ] DOWN → playNav() + hapticNav()

**A button (every screen):**
- [ ] Select card → playClick() + hapticClick()

**B button (every screen that has it):**
- [ ] L2 back → playBack() + hapticBack()
- [ ] QA back → playBack() + hapticBack()
- [ ] Deploy back → playBack() + hapticBack()
- [ ] History back → playBack() + hapticBack()
- [ ] Screenshot Feedback back → playBack() + hapticBack()
- [ ] Error dismiss → playBack() + hapticBack()
- [ ] Exploration back → playBack() + hapticBack()
- [ ] Settings back → playBack() + hapticBack()

**X/Y buttons (per screen):**
- [ ] L3 X (Tell Me More) → playClick()
- [ ] L3 Y (Ship Unhinged) → playClick() + hapticShipIt()
- [ ] L2 Y (Reroll) → playReroll() + hapticReroll()
- [ ] QA X (Run Tests) → playClick()
- [ ] QA Y (View Diff) → playClick()
- [ ] Screenshot Feedback X/Y → playClick()
- [ ] History Y (Rollback) → playClick()

**Global actions:**
- [ ] RB (Screenshot) → playCapture() + hapticCapture()
- [ ] SELECT (Tab toggle) → playToggle() + hapticToggle()
- [ ] LB+DPAD (Split resize) → playToggle() + hapticToggle()
- [ ] RT (Switch to app) → playToggle() + hapticToggle()
- [ ] LT (Switch to DeckForge) → playToggle() + hapticToggle()
- [ ] R4 (Run/restart) → playClick() + hapticClick()

**START menu:**
- [ ] Open menu → playMenuOpen() + hapticMenu()
- [ ] Navigate in menu → playNav() + hapticNav()
- [ ] Select in menu → playClick() + hapticClick()
- [ ] Close menu → playMenuClose() + hapticMenu()
- [ ] Quit → playClick() + hapticClick()

**Ship It (L3):**
- [ ] Ship It → playClick() + hapticClick() + hapticShipIt() (extra rumble)
- [ ] Ship Unhinged → playClick() + hapticClick() + hapticShipIt()

**Keyboard mode (no gamepad):**
- [ ] All SFX still play (audio doesn't depend on gamepad)
- [ ] All haptic calls silently no-op (no console errors)

If ANY action on this list is silent, the prompt is not complete.
