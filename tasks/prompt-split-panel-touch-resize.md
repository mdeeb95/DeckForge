# Prompt: Split Panel Touch Resize

## Goal
Add a visible, draggable divider between the terminal panel and action palette. Works with touch (drag on Steam Deck touchscreen) and mouse (drag on desktop). The existing `LB+D-PAD` gamepad resize still works — this is additive.

## Context
- `splitRatio` store in `src/lib/stores/app.ts` controls the terminal/palette split (0.0–1.0, default ~0.55).
- `LB_DPAD_LEFT` and `LB_DPAD_RIGHT` in `inputRouter.ts` adjust it by 5% increments, clamped to 20%–80%.
- The split is rendered in `App.svelte` or the main layout component using `style="width: {$splitRatio * 100}%"` or similar.
- No touch event listeners exist anywhere in the codebase today.
- Resolution is fixed 1280x800.

## Find the Layout Split

Before building, locate exactly where the terminal panel and action palette are laid out side-by-side. It's likely in `App.svelte` or a layout wrapper. The split is driven by `$splitRatio`. You need to insert the divider between those two panels.

## New Component

### `src/lib/components/SplitDivider.svelte`

A thin vertical divider bar between the two panels:

**Visual design:**
- 4px wide hit target (invisible, for touch/mouse), with a 1px visible line centered inside it
- Visible line: `border-surface-border` color by default (the standard `#30363d`)
- On hover/drag: line becomes `primary` color (`#0df2f2`) with subtle glow — same pattern as selected card accent bars
- Cursor: `col-resize` on desktop
- Height: full panel height (below the status bar, above any bottom bar)

**Interaction:**
- `pointerdown` on the divider starts tracking
- `pointermove` on `window` (not just the divider — user drags fast) calculates new ratio
- `pointerup` on `window` stops tracking
- Use Pointer Events (not Touch + Mouse separately) — they unify both input types
- Calculate ratio: `newRatio = clamp(event.clientX / window.innerWidth, 0.20, 0.80)`
- Update `splitRatio.set(newRatio)` on every move event for live resize
- On drag end: snap to nearest 5% increment for clean values (0.20, 0.25, 0.30, etc.)

**Ratio indicator (on drag only):**
- While dragging, show a small floating label near the divider: `"55 / 45"` showing terminal% / palette%
- Styled like the HintGrid badges: `bg-slate-700/50 text-slate-400 text-[9px] font-mono`
- Positioned vertically centered on the divider, horizontally offset slightly so it doesn't overlap the line
- Fades in on drag start, fades out on drag end (150ms transition)

**Pointer capture:**
- Call `dividerElement.setPointerCapture(event.pointerId)` on pointerdown
- This ensures pointermove fires even if the cursor leaves the divider element
- Release on pointerup

## Files to Modify

### 1. Main Layout (App.svelte or wherever the split is rendered)
- Import and insert `<SplitDivider />` between the terminal panel and action palette
- The divider sits in the flex layout between the two panels, taking zero width from the split calculation (position: absolute or a thin flex-none element)

### 2. `src/lib/input/inputRouter.ts`
- No changes needed — `LB_DPAD_LEFT/RIGHT` still works exactly as before
- The two resize mechanisms (gamepad increment vs touch drag) both write to the same `splitRatio` store

## Design Rules
- **The divider is subtle by default.** It should barely be visible — just a faint line. Only glows on hover/active. Don't make it chunky or distracting.
- **Snap to 5% on release.** During drag it's smooth (live update), but when you release, it snaps to the nearest 0.05 increment. This matches the gamepad behavior.
- **Respect the 20%–80% clamp.** Same limits as the gamepad resize. Don't let the user collapse either panel.
- **No scroll, no overflow.** Both panels must still fit their content within the new ratio at 1280x800.
- **Works with both touch and mouse.** Pointer Events handle both. Don't add separate touch handlers.

## What NOT To Do
- Don't change the gamepad resize logic at all — it still works via `LB_DPAD`.
- Don't make the divider a drag handle with a visible grip icon or dots — too noisy for DeckForge's minimal aesthetic.
- Don't add double-click-to-reset. Keep it simple.
- Don't persist the ratio from touch drag differently than gamepad — both write to the same store, which is already persisted (or not) via the config system.

## Verification
- Mouse: hover over the divider → it glows cyan. Click and drag → panels resize live. Release → snaps to nearest 5%.
- Touch (on Steam Deck or touch-enabled display): drag the divider → same behavior.
- Gamepad: `LB+D-PAD LEFT/RIGHT` still works independently.
- Ratio indicator shows during drag, disappears after.
- Panels don't overflow or break layout at any ratio between 20%–80%.
