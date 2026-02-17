# Task: Ship It Button Animation

## Context
When the user presses A (Ship It) or Y (Ship It Unhinged) on the Plan Review screen (Level 3), the app currently just sets `pendingClaudePrompt` and navigates to `ai_working` instantly. There's no moment of satisfaction — no feedback that says "yes, you just committed."

Add a brief animation on the Ship It card before navigating away. The animation **alternates** between two styles on every press:
- **Glitch Warp:** Card glitches with RGB split, scanline, then warps/stretches. Chaotic and fun.
- **Confirm Pulse:** Clean and professional. Card border ignites cyan, checkmark stamps in, glow pulse radiates outward.

Both are used for Ship It (A) AND Ship It Unhinged (Y). They just alternate: first press = Glitch Warp, second press = Confirm Pulse, third = Glitch Warp, etc. The counter persists across L3 visits within the same app session (simple module-level variable, no localStorage needed).

Both animations are pure CSS (no canvas). ~400-450ms each, then navigation fires.

## Files to Modify

### 1. `src/lib/screens/Level3Screen.svelte`

**Current `shipIt()` function (line 62):**
```typescript
function shipIt(unhinged = false) {
  if (!plan) return;
  trackPlanApproval(unhinged);
  let prompt = plan.claude_code_intent;
  if (unhinged && plan.unhinged_modifier) {
    prompt += `\n\nALSO: ${plan.unhinged_modifier}`;
  }
  pendingClaudePrompt.set(prompt);
  navigate('ai_working');
}
```

**Replace with:**
```typescript
let animatingShip = $state<'glitch' | 'confirm' | null>(null);
let shipAnimationCount = 0; // module-level, persists across L3 visits

function shipIt(unhinged = false) {
  if (!plan || animatingShip) return;
  trackPlanApproval(unhinged);

  let prompt = plan.claude_code_intent;
  if (unhinged && plan.unhinged_modifier) {
    prompt += `\n\nALSO: ${plan.unhinged_modifier}`;
  }

  // Alternate between glitch and confirm
  animatingShip = shipAnimationCount % 2 === 0 ? 'glitch' : 'confirm';
  shipAnimationCount++;
  pendingClaudePrompt.set(prompt);

  setTimeout(() => {
    animatingShip = null;
    navigate('ai_working');
  }, 450);
}
```

**Pass `animatingShip` into ActionPalette** so the card component knows which card is animating:
```svelte
<ActionPalette
  breadcrumb="Plan Review"
  step={3}
  title="Plan Review"
  subtitle={plan ? plan.summary : 'Generating plan...'}
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  animatingButton={animatingShip ? (/* which button was pressed — need to track */ ) : null}
  animationType={animatingShip}
/>
```

To know which button triggered the animation, add a second state variable:
```typescript
let animatingButton = $state<'A' | 'Y' | null>(null);
```
Set it in `shipIt()`:
```typescript
animatingButton = unhinged ? 'Y' : 'A';
```
Clear it alongside `animatingShip` in the setTimeout.

### 2. `src/lib/components/ActionPalette.svelte`

Accept new optional props:
```typescript
let {
  // ... existing props
  animatingButton = null,
  animationType = null,
}: {
  // ... existing types
  animatingButton?: string | null;
  animationType?: 'glitch' | 'confirm' | null;
} = $props();
```

Pass them through to each card. Each card checks: `card.button === animatingButton` → apply the animation class.

### 3. `src/lib/components/ActionCard.svelte` (or wherever individual cards render)

Add CSS keyframes and conditional class application.

**Glitch Warp animation:**
```css
@keyframes glitch-warp {
  0% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
  10% { clip-path: inset(20% 0 60% 0); transform: translate(-4px, 0); }
  15% { clip-path: inset(40% 0 20% 0); transform: translate(4px, 0); }
  20% { clip-path: inset(60% 0 10% 0); transform: translate(-2px, 0); }
  25% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
  30% { clip-path: inset(10% 0 70% 0); transform: translate(6px, 0); filter: hue-rotate(90deg); }
  35% { clip-path: inset(50% 0 30% 0); transform: translate(-6px, 0); filter: hue-rotate(-90deg); }
  40% { clip-path: inset(0 0 0 0); transform: translate(0, 0); filter: none; }
  100% { clip-path: inset(0 0 0 0); transform: translate(0, 0) scaleX(1.5); opacity: 0; }
}
@keyframes scanline {
  0% { top: -10%; }
  100% { top: 110%; }
}
```

When Glitch is active on a card:
- Card gets `animation: glitch-warp 450ms steps(1) forwards`
- A scanline div overlays the card: 2px tall, full width, cyan, `animation: scanline 200ms linear infinite`
- CRT-style overlay on the card: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(13,242,242,0.03) 2px, rgba(13,242,242,0.03) 4px)`

**Confirm Pulse animation:**
```css
@keyframes border-ignite {
  0% { border-color: var(--border-default); box-shadow: none; }
  30% { border-color: #0df2f2; box-shadow: 0 0 20px rgba(13,242,242,0.25), inset 0 0 20px rgba(13,242,242,0.06); }
  100% { border-color: rgba(13,242,242,0.5); box-shadow: 0 0 10px rgba(13,242,242,0.12); }
}
@keyframes check-draw {
  0% { stroke-dashoffset: 24; opacity: 0; }
  40% { opacity: 0; }
  50% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}
@keyframes pulse-glow {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

When Confirm is active on a card:
- Card border ignites: `animation: border-ignite 450ms ease-out forwards`
- A small SVG checkmark draws itself inside the card next to the title:
  ```html
  <svg width="16" height="16" viewBox="0 0 16 16">
    <path d="M3 8 L7 12 L13 4" fill="none" stroke="#0df2f2" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24"
      style="animation: check-draw 450ms ease-out forwards" />
  </svg>
  ```
- A pulse ring expands outward from the card border: `animation: pulse-glow 600ms ease-out forwards`

### 4. During animation, disable gamepad input

While `animatingShip !== null`, the cards' `onclick` handlers should be no-ops. The `if (animatingShip) return` guard in `shipIt()` handles re-presses. But also make sure the gamepad handler doesn't fire B (go back) or X (expand) during the 450ms window.

Simplest approach: set `screenCards` to an empty array during animation. The gamepad dispatcher reads from `screenCards`, so clearing it effectively locks out all button presses. Restore isn't needed since we navigate away.

```typescript
// In the setTimeout callback, before navigate:
screenCards.set([]); // lock out gamepad
```

Actually, set it at animation START, not end:
```typescript
animatingShip = shipAnimationCount % 2 === 0 ? 'glitch' : 'confirm';
shipAnimationCount++;
screenCards.set([]); // lock gamepad during animation
pendingClaudePrompt.set(prompt);
```

## Acceptance Criteria

- [ ] Pressing A or Y on L3 plays an animation (~450ms), THEN navigates to ai_working
- [ ] Animation alternates between Glitch Warp and Confirm Pulse on each press (across the session)
- [ ] Both A (Ship It) and Y (Ship It Unhinged) use the same alternating system
- [ ] Animations are pure CSS — no canvas, no JS animation frames
- [ ] Gamepad input is blocked during the animation window (no accidental double-fires or back-press)
- [ ] Both animations use DeckForge palette colors (primary cyan #0df2f2)
- [ ] No scroll, no layout shift — animation plays in-place on the card
- [ ] Works on 1280x800 viewport

## Design Reference
See `tasks/todo/ship-it-animation-mockup.jsx` for interactive React previews of all 6 candidate animations. The two selected are **Glitch Warp** and **Confirm Pulse**, alternating.
