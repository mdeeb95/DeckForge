# Task: Warp Zoom Animation on Card Navigation

## Goal

When the user navigates between ABXY cards with D-pad (up/down), the **previously selected card** plays a "warp zoom out" exit animation and the **newly selected card** plays a "warp zoom in" entrance animation. This makes selection feel physical — cards zoom away and zoom in rather than just swapping highlight colors.

This animation fires on **every card switch** across all screens (L1, L2, L3). It is separate from the existing Ship It / Dismiss / Pulse action animations, which only trigger on button press.

## Animation Specs

### Warp Zoom Out (deselecting card — "go away")

```css
@keyframes warp-zoom-out {
  0%   { transform: scale(1); opacity: 1; filter: none; }
  40%  { transform: scale(0.92); opacity: 0.7; filter: brightness(1.6) saturate(0); }
  100% { transform: scale(1); opacity: 1; filter: none; }
}
```

- Duration: **250ms**
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out expo)
- The card briefly shrinks and flashes bright (desaturated), then settles back at normal size in its unselected state
- Border color sweeps from cyan → border default during the animation

### Warp Zoom In (newly selected card — "appear")

```css
@keyframes warp-zoom-in {
  0%   { transform: scale(1.08); opacity: 0.6; filter: brightness(0.6); }
  60%  { transform: scale(0.98); opacity: 1; filter: none; }
  100% { transform: scale(1); opacity: 1; filter: none; }
}
```

- Duration: **300ms**
- Easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` (springy overshoot)
- The card starts slightly oversized and dim, bounces down past 1.0, then settles
- The cyan accent bar and glow shadow appear simultaneously with the scale-down
- A brief border flash: `box-shadow: 0 0 16px rgba(13, 242, 242, 0.3)` that fades to the normal glow

## Files to Modify

### 1. `src/lib/components/ActionPalette.svelte` — Track previous selection

Add state to detect when `selectedIndex` changes and determine which card is entering vs exiting:

```typescript
let prevIndex = $state(-1);
let enteringIndex = $state(-1);
let exitingIndex = $state(-1);

$effect(() => {
  if (selectedIndex !== prevIndex && prevIndex >= 0) {
    exitingIndex = prevIndex;
    enteringIndex = selectedIndex;

    // Clear transition flags after animation completes
    setTimeout(() => {
      exitingIndex = -1;
      enteringIndex = -1;
    }, 320); // slightly longer than longest animation
  }
  prevIndex = selectedIndex;
});
```

Pass a new `switchAnimation` prop to each ActionCard:

```svelte
{#each cards as card, i}
  <ActionCard
    ...existing props...
    switchAnimation={i === enteringIndex ? 'zoom-in' : i === exitingIndex ? 'zoom-out' : null}
  />
{/each}
```

### 2. `src/lib/components/ActionCard.svelte` — Add switch animations

Add the new prop:

```typescript
interface Props {
  // ...existing...
  switchAnimation?: 'zoom-in' | 'zoom-out' | null;
}
```

Apply classes to the outer div of BOTH selected and unselected states:

```svelte
<!-- SELECTED STATE -->
<div
  class="relative group ... {switchAnimation === 'zoom-in' ? 'card-warp-in' : ''}"
  ...
>

<!-- UNSELECTED STATE -->
<div
  class="relative group ... {switchAnimation === 'zoom-out' ? 'card-warp-out' : ''}"
  ...
>
```

Add the keyframes and classes in `<style>`:

```css
/* ── Warp Zoom Card Switch ── */
@keyframes warp-zoom-out {
  0%   { transform: scale(1); opacity: 1; filter: none; }
  40%  { transform: scale(0.92); opacity: 0.7; filter: brightness(1.6) saturate(0); }
  100% { transform: scale(1); opacity: 1; filter: none; }
}

@keyframes warp-zoom-in {
  0%   { transform: scale(1.08); opacity: 0.6; filter: brightness(0.6); }
  60%  { transform: scale(0.98); opacity: 1; filter: none; }
  100% { transform: scale(1); opacity: 1; filter: none; }
}

@keyframes warp-glow {
  0%   { box-shadow: 0 0 0 rgba(13, 242, 242, 0); }
  40%  { box-shadow: 0 0 20px rgba(13, 242, 242, 0.3), -4px 0 12px rgba(13, 242, 242, 0.15); }
  100% { box-shadow: -4px 0 12px rgba(13, 242, 242, 0.15); }
}

@keyframes warp-border-sweep {
  0%   { border-color: #0df2f2; }
  50%  { border-color: rgba(13, 242, 242, 0.3); }
  100% { border-color: #30363d; }
}

:global(.card-warp-out) {
  animation: warp-zoom-out 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

:global(.card-warp-in) {
  animation: warp-zoom-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
             warp-glow 400ms ease-out forwards;
}
```

### 3. Interaction with existing animations

The warp zoom switch animation should **NOT** fire when an action animation is playing (`animationType` is set). This prevents visual conflict when Ship It, Dismiss, or Pulse are active:

In ActionPalette's `$effect`:

```typescript
$effect(() => {
  // Don't trigger switch animation during action animations
  if (animatingButton) return;

  if (selectedIndex !== prevIndex && prevIndex >= 0) {
    exitingIndex = prevIndex;
    enteringIndex = selectedIndex;
    setTimeout(() => {
      exitingIndex = -1;
      enteringIndex = -1;
    }, 320);
  }
  prevIndex = selectedIndex;
});
```

## Also: Fix Terminal Auto-Scroll

The auto-scroll code in `TerminalPanel.svelte` (lines 22-30) exists but may not fire reliably when entries are added programmatically (e.g., by `expandPlan()`). The issue is `requestAnimationFrame` may run before Svelte has flushed DOM updates.

Replace the current auto-scroll `$effect` with a more reliable version:

```typescript
import { tick } from 'svelte';

$effect(() => {
  const _ = $activeTab === 'claude' ? $entries : $appOutput;
  if (contentEl) {
    // Wait for Svelte to flush DOM updates, THEN scroll
    tick().then(() => {
      requestAnimationFrame(() => {
        if (contentEl) {
          contentEl.scrollTop = contentEl.scrollHeight;
        }
      });
    });
  }
});
```

This ensures DOM is fully updated before measuring `scrollHeight`.

## Verification

1. Open any screen with cards (L1, L2, L3)
2. Press D-pad down — previously selected card should briefly shrink/flash bright, new card should bounce in from slightly oversized with a glow pulse
3. Press D-pad up — same animation in reverse direction
4. Navigate rapidly — animations should not stack or jitter (setTimeout clears flags)
5. Press A/B/X/Y — action animations (Ship It, Dismiss, Pulse) should still work without interference from switch animations
6. Check terminal — new entries should auto-scroll into view on all screens, including after expand plan
