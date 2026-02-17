# Task: Universal Card Animations

## Context
Currently only Ship It (A) and Ship It Unhinged (Y) on L3 have activation animations (alternating Glitch Warp / Confirm Pulse). The other two cards — Nah Go Back (B) and Tell Me More (X) — have no feedback when pressed. Every card press should feel satisfying.

Expand the animation system so **every card on every screen** gets a brief animation when activated. The animation type should match the card's intent, not be one-size-fits-all.

## Animation Types

Add these new animation types to the existing system in `ActionCard.svelte`:

### 1. `'dismiss'` — For "go back" / cancel / rejection actions
A quick slide-left + fade. The card retreats, signaling "nah."
```css
@keyframes dismiss-slide {
  0% { transform: translateX(0); opacity: 1; }
  40% { transform: translateX(-12px); opacity: 0.7; }
  100% { transform: translateX(-24px); opacity: 0; }
}
```
Duration: 300ms. Applied to the outer card wrapper.

### 2. `'pulse'` — For "tell me more" / info / exploration actions
A quick cyan ripple from the card center. Acknowledges the press without implying navigation.
```css
@keyframes info-pulse {
  0% { box-shadow: 0 0 0 0 rgba(13, 242, 242, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(13, 242, 242, 0.15); }
  100% { box-shadow: 0 0 0 16px rgba(13, 242, 242, 0); }
}
```
Duration: 350ms. Applied to the inner card div. Card stays visible after (no opacity change).

### 3. Keep existing `'glitch'` and `'confirm'` as-is
They already work for Ship It actions.

## Files to Modify

### 1. `src/lib/components/ActionCard.svelte`

**Update the Props type:**
```typescript
animationType?: 'glitch' | 'confirm' | 'dismiss' | 'pulse' | null;
```

**Add dismiss animation rendering (selected block):**
```svelte
<div
  class="relative group {onclick ? 'cursor-pointer' : 'cursor-default'}
    {animationType === 'glitch' ? 'ship-glitch-warp' : ''}
    {animationType === 'dismiss' ? 'card-dismiss' : ''}"
  onclick={onclick}
>
```

**Add pulse animation rendering (on the inner card div):**
```svelte
<div class="... {animationType === 'pulse' ? 'card-info-pulse' : ''} {animationType === 'confirm' ? 'ship-confirm-border' : ''}">
```

**Add the new CSS keyframes in the `<style>` block:**
```css
/* ── Dismiss Animation ── */
@keyframes dismiss-slide {
  0% { transform: translateX(0); opacity: 1; }
  40% { transform: translateX(-12px); opacity: 0.7; }
  100% { transform: translateX(-24px); opacity: 0; }
}

:global(.card-dismiss) {
  animation: dismiss-slide 300ms ease-in forwards;
}

/* ── Info Pulse Animation ── */
@keyframes info-pulse {
  0% { box-shadow: 0 0 0 0 rgba(13, 242, 242, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(13, 242, 242, 0.15); }
  100% { box-shadow: 0 0 0 16px rgba(13, 242, 242, 0); }
}

:global(.card-info-pulse) {
  animation: info-pulse 350ms ease-out forwards;
}
```

**CRITICAL: Animations must work on BOTH the selected AND unselected card templates.** Currently the animation only applies inside `{#if selected}`. Copy the animation class bindings and overlay elements into the `{:else}` (unselected) block too. The user might press a button that corresponds to a card that isn't currently highlighted by the D-pad. The gamepad maps A/B/X/Y directly to cards by button label, not by selection index.

### 2. `src/lib/components/ActionPalette.svelte`

**Update Props type:**
```typescript
animationType?: 'glitch' | 'confirm' | 'dismiss' | 'pulse' | null;
```

No other changes needed — it already passes `animationType` through to ActionCard.

### 3. `src/lib/screens/Level3Screen.svelte`

**Expand the animation state type:**
```typescript
let animatingShip = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
let animatingButton = $state<'A' | 'B' | 'X' | 'Y' | null>(null);
```

**Add animation to `goBack()` (the B card):**
```typescript
function goBack() {
  if (animatingShip) return;
  trackPlanRejection();

  animatingShip = 'dismiss';
  animatingButton = 'B';
  screenCards.set([]); // lock gamepad

  setTimeout(() => {
    animatingShip = null;
    animatingButton = null;
    navigate('level2');
  }, 300);
}
```

**Add animation to `expandPlan()` (the X card):**
```typescript
async function expandPlan() {
  if (!plan) { ... }
  if (isExpanding) return;

  // Flash the pulse animation
  animatingShip = 'pulse';
  animatingButton = 'X';

  // Clear animation after it plays (but don't block the expansion)
  setTimeout(() => {
    animatingShip = null;
    animatingButton = null;
  }, 350);

  isExpanding = true;
  expandDepth++;
  // ... rest of existing expand logic
}
```

Note: X's animation does NOT lock gamepad or delay the action — the pulse is cosmetic feedback while the expansion runs concurrently.

### 4. `src/lib/screens/Level1Screen.svelte`

Apply the same pattern. L1 has 4 category cards (Feature / Bug / Tech Debt / YOLO). Each should animate on press:
- **A (Feature):** `'confirm'` — cyan confirm pulse, then navigate to L2
- **B (Bug):** `'confirm'` — same
- **X (Tech Debt):** `'confirm'` — same
- **Y (YOLO):** `'glitch'` — always glitch warp for YOLO (design rule: Y is always ridiculous)

Add animation state and wire up each card's onclick with a brief animation + setTimeout before navigating.

### 5. `src/lib/screens/Level2Screen.svelte`

L2 has suggestion cards (A and B). Both should get `'confirm'` animation on selection, then navigate to L3.

### 6. `src/lib/screens/AIWorkingScreen.svelte`

After task completion, the A (Continue) and B (Back to Home) cards should animate:
- **A (Continue):** `'confirm'` — then navigate to QA mode
- **B (Back to Home):** `'dismiss'` — then navigate to L1

### 7. `src/lib/screens/QAModeScreen.svelte` (if it exists and has cards)

Same pattern — apply appropriate animations to each card.

## Animation Assignment Summary

| Screen | Button | Action | Animation | Duration |
|--------|--------|--------|-----------|----------|
| L1 | A | Feature | confirm | 350ms |
| L1 | B | Bug | confirm | 350ms |
| L1 | X | Tech Debt | confirm | 350ms |
| L1 | Y | YOLO | glitch | 450ms |
| L2 | A | Select suggestion | confirm | 350ms |
| L2 | B | Select suggestion | confirm | 350ms |
| L3 | A | Ship It | glitch/confirm alternating | 450ms |
| L3 | B | Nah, Go Back | dismiss | 300ms |
| L3 | X | Tell Me More | pulse | 350ms |
| L3 | Y | Ship It Unhinged | glitch/confirm alternating | 450ms |
| AI Working | A | Continue | confirm | 350ms |
| AI Working | B | Back to Home | dismiss | 300ms |

## Acceptance Criteria

- [ ] All 4 animation types work: `glitch`, `confirm`, `dismiss`, `pulse`
- [ ] Every card on L1 animates when pressed
- [ ] Every card on L2 animates when pressed
- [ ] Every card on L3 animates when pressed (Ship It alternates, B dismisses, X pulses)
- [ ] Post-completion cards on AI Working screen animate
- [ ] Animations work regardless of whether the card is selected (D-pad highlighted) or not
- [ ] Gamepad input is locked during animations that navigate away (Ship It, Go Back, category select)
- [ ] Gamepad input is NOT locked for non-navigating animations (Tell Me More pulse)
- [ ] Y on L1 always uses glitch animation (YOLO = always ridiculous)
- [ ] No scroll, no layout shift — all animations are in-place
- [ ] CSS only — no canvas, no JS requestAnimationFrame
- [ ] Works on 1280x800 viewport
