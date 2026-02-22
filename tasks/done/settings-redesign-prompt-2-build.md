# Prompt 2 of 3: Build New Settings Mega-List Screen

## Goal
Replace the gutted `SettingsScreen.svelte` with a new single-screen modal design. This is a scrollable mega-list of all settings, grouped by section headers, rendered as a modal overlay on top of the previous screen. No sub-screens, no ActionPalette, no ActionCard — entirely custom components.

## Reference
The exact design is in `settings-mockup.html` at the project root. Open it in a browser to see the layout, animations, and interactions. All CSS values below are final and tuned — use them exactly.

## Architecture

### New Component: `src/lib/screens/SettingsScreen.svelte`
This is the only settings file. It renders a **modal overlay** with:
- A **backdrop** (animated blur + dark overlay)
- A **modal container** (820×660px, centered, with entrance animation)
- A **header** with gear icon + "DeckForge Settings" + close button
- A **scrollable mega-list** of setting rows grouped by section headers
- A **footer** with hint keys
- An optional **scanline overlay** (CRT cosmetic)

### New Component: `src/lib/components/SettingRow.svelte`
A reusable setting row component. Props:
- `label: string` — setting name
- `description: string` — short description below label
- `focused: boolean` — whether this row is currently focused
- A `children` snippet/slot for the right-side control (toggle, slider, selector, etc.)

### New Component: `src/lib/components/SettingSection.svelte`
A section header divider. Props:
- `title: string` — section name (e.g., "Prediction Engine")
- `icon: string` — SVG icon (inline)

These are purely visual dividers — they are **not focusable** and get skipped by gamepad navigation.

## HTML Structure (from mockup)

The modal body is a single scrollable `<div>` containing interleaved section headers and setting rows:

```
Backdrop (full-screen, animated)
└── Modal (820×660, centered)
    ├── Header (gear icon, title, close button)
    ├── Scroll Area
    │   ├── Section: "Prediction Engine"
    │   │   ├── Row: Backend Mode         [toggle: Proxied/Direct]
    │   │   ├── Row: API Key              [masked field + keyboard btn]
    │   │   ├── Row: Model Override       [← selector →]
    │   │   └── Row: Temperature          [← slider →]
    │   ├── Section: "Display & Input"
    │   │   ├── Row: Split Ratio          [← slider →]
    │   │   ├── Row: Scanline Overlay     [toggle: On/Off]
    │   │   ├── Row: Theme                [static: "default"]
    │   │   └── Row: Stick Scroll Speed   [← slider →]
    │   ├── Section: "Telemetry & Cost"
    │   │   ├── Row: Telemetry            [toggle: Enabled/Disabled]
    │   │   ├── Row: Cost Indicator       [toggle: Shown/Hidden]
    │   │   └── Row: Budget Alert         [← slider →]
    │   └── Section: "Advanced"
    │       ├── Row: Permission Mode      [← selector →]
    │       ├── Row: View Config          [action: dumps to terminal]
    │       ├── Row: System Info          [static: version string]
    │       └── Row: Reset to Defaults    [destructive action]
    └── Footer (hint keys: ↑↓ Navigate, A Toggle, ←→ Adjust, B Back)
```

## CSS — Exact Values (use these precisely)

### Backdrop
```css
.settings-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0);
  backdrop-filter: blur(0px);
  animation: backdropIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
}
@keyframes backdropIn {
  to { background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
}
```

### Modal
```css
.settings-modal {
  position: relative;
  width: 820px;
  height: 660px;
  background: var(--surface-dark); /* #161b22 — use Tailwind token */
  border: 1px solid var(--surface-border); /* #30363d */
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  opacity: 0;
  transform: scale(0.92) translateY(20px);
  animation: modalIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
}
@keyframes modalIn {
  to { opacity: 1; transform: scale(1) translateY(0); }
}
```

### Setting Row — Base (unfocused)
```css
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #0d1117; /* var(--bg) */
  border: 1px solid #30363d;
  border-left: 1px solid #30363d;
  border-radius: 4px;
  cursor: default;
  margin-bottom: 4px;
  transition:
    transform 0.2s cubic-bezier(0.16,1,0.3,1),
    padding-left 0.58s cubic-bezier(0.22,1,0.36,1),
    border-color 0.33s ease,
    border-left-width 0.58s cubic-bezier(0.22,1,0.36,1),
    border-left-color 0.58s cubic-bezier(0.22,1,0.36,1),
    box-shadow 0.33s ease,
    background 0.33s ease;
  transform-origin: center center;
  position: relative;
  overflow: hidden;
}
```

### Setting Row — Focused
```css
.setting-row.focused {
  border-color: #0df2f2;
  border-left: 2px solid #0df2f2;
  padding-left: 21px;
  transform: scale(1.015);
  transition:
    transform 0.2s cubic-bezier(0.16,1,0.3,1),
    padding-left 0.58s cubic-bezier(0.22,1,0.36,1),
    border-color 0.25s ease,
    border-left-width 0.58s cubic-bezier(0.22,1,0.36,1),
    border-left-color 0.58s cubic-bezier(0.22,1,0.36,1),
    box-shadow 0.25s ease,
    background 0.25s ease;
  box-shadow:
    -2px 0 18px rgba(13,242,242,0.25),
    0 0px 9px rgba(13,242,242,0.1),
    0 0 16px rgba(13,242,242,0.8),
    inset 0 0 0 1px rgba(13,242,242,0);
  background: rgba(13,242,242,0.08);
  z-index: 2;
}
```

### Setting Row Label
```css
.setting-label {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  transition: color 0.25s ease;
}
.setting-row.focused .setting-label {
  color: #0df2f2;
}
```

### Setting Row Description
```css
.setting-desc {
  font-size: 11px;
  color: #484f58;
  font-family: 'JetBrains Mono', monospace;
}
```

### Entrance Animation (stagger per row)
```css
.setting-row {
  opacity: 0;
  transform: translateY(10px);
  animation: rowIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
}
@keyframes rowIn {
  to { opacity: 1; transform: translateY(0); }
}
```
Apply stagger delays: each row gets `animation-delay` incrementing by 0.04s (first row 0.12s, second 0.16s, etc.)

### Section Headers
```css
.settings-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 0 8px;
}
.settings-section:first-child {
  padding-top: 12px;
}
.section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #0df2f2;
  opacity: 0.7;
}
.section-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, #30363d, transparent);
}
```

### Scroll Area
```css
.settings-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 28px 20px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: #30363d transparent;
}
```

### Right-side Controls
Use Tailwind classes for these — they're functional elements, not animation-critical:
- **Toggle value badge**: `font-mono text-xs font-semibold px-3 py-1 rounded border` — cyan variant when active, neutral (slate) when off, amber for budget, pink for cost indicator
- **Slider**: horizontal track (150px wide, 5px tall, `#30363d` bg) with cyan fill and draggable thumb. Thumb gets a spring bounce animation on adjust (`cubic-bezier(0.34,1.56,0.64,1)`)
- **Model selector**: `← model-name →` with D-pad badge arrows and swap animation (slide out 150ms, slide in 200ms)
- **Button badges**: small colored badges showing the gamepad button (A=green, X=blue, Y=amber, D-pad=neutral slate)
- **Destructive tag**: red text, red border, red bg tint, uppercase mono, for "Reset to Defaults"

### Value Pop Animation (on toggle/adjust, only on the focused row)
```css
@keyframes valuePop {
  0%   { transform: scale(1); }
  30%  { transform: scale(1.15); }
  100% { transform: scale(1); }
}
```

### Slider Thumb Bounce (on adjust, only on the focused row)
```css
@keyframes thumbBounce {
  0%   { transform: translate(-50%,-50%) scale(1); }
  40%  { transform: translate(-50%,-50%) scale(1.5); }
  100% { transform: translate(-50%,-50%) scale(1); }
}
```

### Model Swap Animation
```css
@keyframes modelSwapOut { to { opacity: 0; transform: translateY(-8px); } }
@keyframes modelSwapIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Footer
```css
.settings-footer {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 28px;
  border-top: 1px solid #30363d;
  background: rgba(0,0,0,0.2);
  flex-shrink: 0;
}
```
Hint keys use `<kbd>` elements — tiny mono badges that flash cyan briefly when the corresponding input fires.

### Scanlines (cosmetic overlay, optional)
```css
.settings-scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
  );
  opacity: 0;
  animation: scanlinesIn 1s 0.8s forwards;
}
@keyframes scanlinesIn { to { opacity: 1; } }
```

## Scroll Behavior
When the focused row changes (via D-pad up/down), auto-scroll the scroll area to **center** the focused row vertically:
```
rowCenter = row.offsetTop - scrollArea.offsetTop + row.offsetHeight / 2
targetScroll = rowCenter - scrollArea.clientHeight / 2
scrollArea.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
```

## Important Notes
- This screen does **NOT** use `TerminalPanel` or `ActionPalette` — it's a completely standalone modal that overlays everything
- The SettingsScreen should be rendered **on top of** whatever screen was showing before (the backdrop blurs it). Use `position: absolute; inset: 0;` on the outermost wrapper, with `display: flex; align-items: center; justify-content: center;`
- Section headers are **not focusable** — D-pad up/down skips them and only lands on setting rows
- All 14 setting rows are in a flat array for focus tracking — `focusIndex` ranges from 0 to 13
- The `focused` class is managed by a reactive variable, not by the old `selectedCardIndex` store
- Each setting row should read its current value reactively from `$globalConfig`
- Do not break the existing TerminalPanel/ActionPalette system — this screen simply doesn't use them

## Housekeeping
- Populate `settingsAdjustHandlers` from `src/lib/stores/app.ts` with per-row L/R handlers so D-pad adjust works via the existing inputRouter wiring.

## Do NOT
- Do not use ActionPalette or ActionCard components
- Do not use the `screenCards` or `selectedCardIndex` stores
- Do not add any new routes or screen types
- Do not implement config persistence or gamepad wiring — that's Prompt 3
