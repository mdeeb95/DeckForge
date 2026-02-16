# DeckForge — Visual Style Guide

**The canonical reference for every visual decision.** When Claude Code builds Svelte components, this document is the source of truth. Every hex code, every font weight, every shadow — it's here. No guessing.

**Reference implementation:** `code.html` (the approved mockup). This doc extracts and codifies every token from that file.

---

## 1. DESIGN PHILOSOPHY

DeckForge looks like a premium dev tool that happens to run on a gamepad. It's dark, dense, and confident. Think: GitHub's dark theme meets a cyberpunk mission control. The interface is information-rich but never cluttered — every pixel earns its space.

**What it IS:** Professional. Clean. Quietly futuristic. The kind of UI a senior engineer would nod at approvingly.

**What it is NOT:** Fake hackery. No underscores-as-aesthetic. No "SYSTEM OVERRIDE" cosplay. No gratuitous glow. No Matrix rain. The terminal is real — the decoration is minimal.

**One rule:** Color only appears where it means something. If something glows, it's because the user needs to look at it.

---

## 2. COLOR SYSTEM

### 2.1 Core Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#0df2f2` | Cyan. Selected states, active indicators, DeckForge branding, terminal prompt, links. The signature color. |
| `primary-dim` | `#089090` | Dimmed cyan. Borders on primary elements, subtle highlights, secondary emphasis. |
| `secondary` | `#f20dcf` | Pink/magenta. B-button badge, git branch names, warning accents. Used sparingly. |
| `background-dark` | `#0d1117` | Base background. The darkest surface in the app. Terminal background, app background. |
| `surface-dark` | `#161b22` | Raised surface. Cards, panels, status bar, header bars. One step above background. |
| `surface-border` | `#30363d` | Borders between panels, card outlines, dividers. The structural skeleton. |

### 2.2 Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `success` / `connected` | `#34d399` (emerald-400) | Connected indicator, healthy status, completed steps, diff additions (+lines) |
| `code-keyword` | `#ff7b72` | Syntax: keywords (import, const, export) |
| `code-string` | `#a5d6ff` | Syntax: string literals |
| `code-function` | `#d2a8ff` | Syntax: function names, identifiers |
| `code-comment` | `#8b949e` | Syntax: comments, disabled text |

### 2.3 Text Hierarchy

| Level | Color | Tailwind Class | Usage |
|-------|-------|---------------|-------|
| **Brightest** | `#ffffff` | `text-white` | Project names, selected card titles, emphasized values |
| **Primary text** | `#0df2f2` | `text-primary` | Active card title, branding, selected states |
| **Body** | `#cbd5e1` | `text-slate-300` | Default body text, descriptions, terminal output |
| **Secondary** | `#94a3b8` | `text-slate-400` | Card descriptions, metadata, secondary info |
| **Muted** | `#64748b` | `text-slate-500` | Timestamps, separators, inactive elements |
| **Dim** | `#475569` | `text-slate-600` | Line numbers, barely-visible labels |

### 2.4 ABXY Button Colors

Each gamepad button has a consistent color everywhere it appears:

| Button | Color | Hex | Background (20% opacity) | Border (30% opacity) |
|--------|-------|-----|-------------------------|---------------------|
| **A** | Cyan (primary) | `#0df2f2` | `rgba(13,242,242,0.2)` | `rgba(13,242,242,0.3)` |
| **B** | Pink (secondary) | `#f20dcf` | `rgba(242,13,207,0.2)` | `rgba(242,13,207,0.3)` |
| **X** | Slate (neutral) | `#cbd5e1` | `slate-700` bg | `slate-600` border |
| **Y** | Slate (neutral) | `#cbd5e1` | `slate-700` bg | `slate-600` border |

**Note:** In the reference implementation, X and Y use neutral slate badges (not purple/yellow as in earlier mockups). This is intentional — it reduces visual noise. Only A (selected/primary) and B (secondary action) get strong color. X and Y are visually quieter because they're contextual actions, not primary picks.

**When to override:** On Level 1 (category select), all four buttons get their branded colors because they represent equal-weight categories. On Level 2+ where A/B are the main choices, X/Y fade to neutral.

---

## 3. TYPOGRAPHY

### 3.1 Font Stack

| Role | Family | Weight Range | Usage |
|------|--------|-------------|-------|
| **Display** | Space Grotesk | 300–700 | All UI text: labels, descriptions, headers, body text. Clean geometric sans-serif. |
| **Mono** | JetBrains Mono | 400–700 | Terminal output, code blocks, timestamps, status indicators, button hint labels, technical values. |

**Import:**
```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

### 3.2 Type Scale

| Element | Font | Size | Weight | Transform | Tracking |
|---------|------|------|--------|-----------|----------|
| **Status bar text** | Mono | 12px (text-xs) | 400 | uppercase | tracking-wider |
| **Panel header** | Mono | 14px (text-sm) | 400 | none | normal |
| **Section title** | Display | 12px (text-xs) | 700 (bold) | uppercase | tracking-widest |
| **Card title (selected)** | Display | 14px (text-sm) | 700 (bold) | none | normal |
| **Card title (unselected)** | Display | 14px (text-sm) | 500 (medium) | none | normal |
| **Card description** | Display | 12px (text-xs) | 400 | none | normal |
| **Pill badge text** | Display | 10px (text-[10px]) | 400 | none | normal |
| **Terminal output** | Mono | 12–14px (text-xs to text-sm) | 400 | none | normal |
| **Bottom HUD labels** | Display | 12px (text-xs) | 700 (bold) | uppercase | tracking-wide |
| **Hint/footer text** | Mono | 10px (text-[10px]) | 400 | none | normal |

### 3.3 Typography Rules

- **No underscores in labels.** Use normal title case with spaces: "Add Search and Filter", not "ADD_SEARCH_FILTER".
- **Quips are lowercase italic.** They're personality, not UI elements: "find your own notes for once" not "Find Your Own Notes For Once."
- **Terminal output is the only place uppercase is loud.** "USER PROMPT", "THOUGHT PROCESS" — because it's mimicking a real terminal, not decorating.
- **Monospace for anything that could be a value.** Costs, timestamps, version numbers, file paths, token counts — all mono.

---

## 4. LAYOUT

### 4.1 Screen Dimensions

- **Target resolution:** 1280×800 (Steam Deck native)
- **All layouts must work at this exact size.** No responsive breakpoints needed for the core app.

### 4.2 Global Structure

```
┌─────────────────────────────────────────────────────────┐
│ STATUS BAR (h-8 / 32px)                                 │
├──────────────────────────────────┬──────────────────────┤
│                                  │                      │
│  LEFT PANEL                      │  RIGHT PANEL         │
│  Claude Code Terminal            │  Action Palette      │
│  flex-1 (fills remaining)        │  w-[320–380px]       │
│                                  │  fixed width         │
│                                  │                      │
│                                  │                      │
├──────────────────────────────────┴──────────────────────┤
│              FLOATING BOTTOM HUD (absolute positioned)   │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Panel Sizing

| Panel | Width | Background | Border |
|-------|-------|-----------|--------|
| **Left (terminal)** | `flex-1` (fills remaining space, ~55-60%) | `background-dark` (#0d1117) | Right border: `surface-border` |
| **Right (palette)** | `w-[320px]` to `w-[380px]` fixed | `surface-dark` (#161b22) | Left border: `surface-border` |

**Note:** The user-configurable split ratio (LB + D-pad) adjusts these proportions. Min 20% / max 80% per the requirements doc. Default is approximately 55/45.

### 4.4 Spacing System

Standard Tailwind spacing. Key recurring values:
- **Panel padding:** `p-3` to `p-4` (12–16px)
- **Card padding:** `p-3` (12px)
- **Card gap:** `space-y-2` (8px between cards)
- **Inline element gap:** `gap-2` (8px) for icon+text, `gap-4` (16px) for section separators
- **Section header margin-bottom:** `mb-1` (4px)

---

## 5. COMPONENTS

### 5.1 Status Bar (Top)

- **Height:** 32px (`h-8`)
- **Background:** `surface-dark`
- **Border:** bottom, `surface-border`
- **Content:** Flex row, space-between
- **Left side:** DeckForge icon + name (primary, bold, mono), pipe separator (`text-slate-500`), project name, pipe, connection status with pulsing dot
- **Right side:** System stats (RAM, CPU) in `text-slate-400`, version in `text-primary`
- **Connection dot:** `w-1.5 h-1.5 rounded-full bg-emerald-400`

### 5.2 Terminal Header

- **Height:** 40px (`h-10`)
- **Background:** `surface-dark` at 50% opacity
- **Content:** Left shows "> Claude Code Stream" in primary + "STREAMING" badge; Right shows pill badges for cost and scope
- **Streaming badge:** `bg-primary/20 text-primary border-primary/30`, rounded, 10px text, bold

### 5.3 Terminal Content

- **Font:** JetBrains Mono, text-xs to text-sm
- **Line height:** relaxed (`leading-relaxed`)
- **Padding:** p-4
- **Scrollable:** `overflow-y-auto`
- **User prompt block:** Left border accent (`border-l-2 border-primary/50`), "USER PROMPT" label in primary bold
- **Thought process:** "THOUGHT PROCESS" in secondary (pink) bold. Body in `text-slate-400`. Inline code references: `bg-slate-800 px-1 rounded text-slate-300`
- **Code block:** `bg-[#0b0e11] border-surface-border rounded p-3`. File path label top-right in 10px `text-slate-500`. Diff additions in `text-green-500` with + prefix.
- **Waiting state:** Pulsing cursor block (`w-2 h-4 bg-primary animate-pulse`) + "Waiting for user selection..." in `text-slate-400`

### 5.4 Action Cards (Right Panel)

The core UI element. Four main cards + secondary action cards below a separator.

**Card anatomy:**

```
┌─────────────────────────────────────┐
│  [Badge] Title Text           [A] ←─── corner badge
│  Description text in smaller         │
│  font explaining the action.         │
│  [Pill Tag]  [Metadata]             │
└─────────────────────────────────────┘
```

**Selected card (A):**
- **Left accent:** Absolute positioned bar, `w-1 bg-primary`, left edge, full height, with cyan glow shadow: `shadow-[0_0_10px_rgba(13,242,242,0.6)]`
- **Background:** `#1c242e` (slightly lighter than surface-dark)
- **Border:** `border-2 border-primary/50` (thicker than normal, cyan-tinted)
- **Corner badge:** Top-right, `bg-primary text-black rounded-bl font-bold text-xs`. Contains the button letter.
- **Title:** `text-primary font-bold text-sm`
- **Description:** `text-xs text-slate-300 leading-snug`
- **Pill tags:** `bg-primary/10 text-primary border-primary/20`, rounded, 10px text

**Unselected cards (B, X, Y):**
- **Background:** `surface-dark`
- **Border:** `border-surface-border`, changes to `border-slate-600` on hover
- **Opacity:** 80% base, 100% on hover (`opacity-80 hover:opacity-100`)
- **Corner badge:** `w-5 h-5 rounded-full`, smaller than selected. B gets `bg-secondary/20 text-secondary border-secondary/30`. X and Y get `bg-slate-700 text-slate-300 border-slate-600`.
- **Title:** `text-white font-medium text-sm`
- **Description:** `text-xs text-slate-400 leading-snug`
- **Pill tags:** `bg-slate-800 text-slate-400 border-surface-border`

**Secondary action cards (RB, LB):**
- **Background:** `#13171e` (darker than surface-dark)
- **Border:** `border-dashed border-slate-700` (dashed to visually separate from main cards)
- **Layout:** Horizontal flex row (icon + label on left, material icon on right)
- **Badge:** Rectangle, not circle: `bg-slate-800 text-slate-300 rounded text-[10px] font-bold border-slate-600`
- **Hover:** `hover:bg-surface-dark`
- **Separator above:** `h-px bg-surface-border my-1`

### 5.5 Pill Badges

Small metadata indicators. Two variants:

**Active/colored:**
```
bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded text-[10px]
```

**Neutral:**
```
bg-slate-800 text-slate-400 border border-surface-border px-1.5 py-0.5 rounded text-[10px]
```

**Status pills (cost, scope, etc.):**
```
bg-slate-800 border border-surface-border rounded-full px-2 py-0.5 text-[10px] text-slate-400
```
With optional Material Icon at 10px size.

### 5.6 Floating Bottom HUD

- **Position:** Absolute, bottom-6, horizontally centered (`left-1/2 -translate-x-1/2`)
- **Style:** Glass panel effect: `bg-rgba(22,27,34,0.95) backdrop-blur(8px)`
- **Shape:** `rounded-full` (pill shape), `border-surface-border/50`, heavy shadow (`shadow-2xl`)
- **Padding:** `px-6 py-2`
- **Content:** Button hint groups separated by thin vertical dividers (`w-px h-3 bg-slate-600`)
- **Button hint anatomy:** Small mono badge (`bg-slate-700/50 text-slate-300 rounded text-[10px] border-white/10`) + label in `text-xs font-bold text-slate-300 uppercase tracking-wide`
- **Pointer events:** `pointer-events-none` (it's informational, not interactive)

### 5.7 Glass Panel Effect

Used on the bottom HUD and potentially on overlays/modals:

```css
.glass-panel {
    background: rgba(22, 27, 34, 0.95);
    backdrop-filter: blur(8px);
}
```

### 5.8 Scanline Overlay

Subtle CRT texture across the terminal panel only (not the action palette):

```css
.scan-overlay {
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%);
    background-size: 100% 4px;
    pointer-events: none;
}
```

Applied as an absolute-positioned overlay at 20% opacity (`opacity-20`). Z-index above terminal content but below interactive elements.

---

## 6. INTERACTION STATES

### 6.1 Selection

The selected card is always visually dominant:
- Cyan left accent bar with glow
- Brighter background (`#1c242e` vs `#161b22`)
- Thicker border (2px vs 1px)
- Full opacity (vs 80% for unselected)
- Title in primary color (vs white)

When D-pad moves selection, the previous card animates back to unselected state, and the new card gains all selected properties. Use `transition-all` for smooth state changes.

### 6.2 Hover (for mouse/trackpad fallback)

Unselected cards: `opacity-80 → opacity-100`, border color shifts from `surface-border` to `slate-600`. Transition on opacity and border color.

### 6.3 Terminal Cursor

Blinking block cursor in primary color:
```
w-2 h-4 bg-primary animate-pulse
```

### 6.4 Loading / Streaming State

The "STREAMING" badge on the terminal header indicates Claude Code is active. When idle, this badge changes to "IDLE" with dimmed colors (`bg-slate-800 text-slate-500`).

### 6.5 Pulsing Connection Dot

The status bar connection dot is a static `bg-emerald-400` circle. When disconnected: `bg-red-400`. When reconnecting: add `animate-pulse`.

---

## 7. ICONS

**Icon system:** Material Icons (filled) and Material Symbols Outlined.

```html
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
```

**Usage pattern:** Icons are always small (text-sm or text-[10px]) and inline with text. They provide recognition, not decoration. Used in:
- Status bar: `terminal` icon next to DeckForge name
- Cost/scope pills: `attach_money`, `description`
- Secondary action cards: `refresh`, `question_answer`
- D-pad hint: Rendered as a tiny CSS grid (3×3 dots), not an icon

**Keep icons sparse.** Most cards use NO icons — the ABXY badge IS the icon. Don't add icons to card titles or descriptions unless there's a strong functional reason.

---

## 8. SCROLLBAR

Custom scrollbar for the terminal and card list:

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #0d1117; }
::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #0df2f2; }
```

Scrollbar thumb turns primary cyan on hover — a small touch that reinforces the color system.

---

## 9. BORDER RADII

Intentionally tight. This is a terminal-adjacent app, not a consumer product:

| Token | Value | Usage |
|-------|-------|-------|
| `DEFAULT` | 2px (`0.125rem`) | Most elements, cards, badges |
| `lg` | 4px (`0.25rem`) | Code blocks, larger containers |
| `xl` | 8px (`0.5rem`) | Modals, overlays (rare) |
| `full` | 9999px | Pill badges (cost/scope), bottom HUD, connection dot |

**No large radius anywhere.** The tightest border radius that still looks intentional. Rounded-full is only for pills and dots.

---

## 10. SHADOWS

Used sparingly. Two levels:

| Context | Shadow | Purpose |
|---------|--------|---------|
| **Right panel** | `shadow-2xl` | Separates action palette from terminal. Creates depth. |
| **Bottom HUD** | `shadow-2xl` | Floats the HUD above content. |
| **Selected card glow** | `shadow-[0_0_10px_rgba(13,242,242,0.6)]` | Cyan glow on the left accent bar of selected card. The only "glow" in the UI. |
| **Selected card** | `shadow-lg` | Subtle lift on the selected card body. |

**Rule: Glow is reserved for selection.** Only the currently selected/active element gets the cyan glow shadow. Everything else uses standard dark shadows or no shadow at all.

---

## 11. TEXT SELECTION

Global selection color overrides the browser default:

```html
selection:bg-primary selection:text-black
```

Selected text appears as black-on-cyan. Small detail that reinforces the color system.

---

## 12. TAILWIND CONFIG

The complete Tailwind configuration for DeckForge:

```javascript
tailwind.config = {
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#0df2f2",
                "primary-dim": "#089090",
                "secondary": "#f20dcf",
                "background-light": "#f5f8f8",
                "background-dark": "#0d1117",
                "surface-dark": "#161b22",
                "surface-border": "#30363d",
            },
            fontFamily: {
                "display": ["Space Grotesk", "sans-serif"],
                "mono": ["JetBrains Mono", "monospace"],
            },
            borderRadius: {
                "DEFAULT": "0.125rem",
                "lg": "0.25rem",
                "xl": "0.5rem",
                "full": "9999px"
            },
        },
    },
}
```

**Note for Svelte:** This config will be in `tailwind.config.js` at the project root. Svelte + Tailwind integration via `svelte-add` or manual PostCSS setup in the Tauri project.

---

## 13. SCREEN-SPECIFIC VARIATIONS

The reference mockup shows the Level 2 Feature Select screen. Other screens follow the same system but with these variations:

### Full-Width Screens (no split)
**Used on:** Project Select, Empty State, Exploration Mode, Voice Pitch, Settings.

No terminal panel. The entire 1280×800 is the DeckForge interface. Use `background-dark` as the base, with content centered or in a single column. Cards and components use the same styles.

### Level 1 (Category Select)
All four ABXY cards get their branded colors (A=cyan, B=pink, X=neutral, Y=yellow/gold) since they represent equal-weight categories. Selected card still gets the left accent glow.

### Level 3 (Plan Confirmation)
Left panel shows the streaming plan steps (similar to terminal content but structured as a numbered list). Right panel shows the ABXY actions (Ship It, Nah, Tell Me More, Unhinged). Selected step in the plan can be highlighted with the same left-border accent.

### AI Working
Left panel is actively streaming (the reference mockup's terminal content is a good match). Right panel replaces action cards with a progress tracker: numbered steps with checkmarks/dots, a progress bar (`bg-primary` fill on `bg-slate-800` track), elapsed time, and a single B="Interrupt" card.

### Error State
Cards use `border-red-400/30` tint instead of `surface-border`. The left accent bar on the primary action card is red instead of cyan. Error details shown in the terminal panel with red-tinted output.

---

## 14. DO AND DON'T

**DO:**
- Use the color system consistently. Primary = cyan. Always.
- Keep cards dense. Padding is p-3, not p-6. This is a power tool.
- Make the terminal panel feel alive. Scrolling output, blinking cursor, timestamps.
- Use opacity to create hierarchy. Selected = 100%, unselected = 80%.
- Keep badges small. 10px text, tight padding. They're metadata, not headlines.

**DON'T:**
- Don't add underscores to labels. "Add Search and Filter" not "ADD_SEARCH_FILTER".
- Don't use glow on anything except the selected card's left accent bar.
- Don't put gradients on card backgrounds. Flat colors only.
- Don't use large border radii. 2px default, 4px max for containers.
- Don't add decorative icons to cards. The ABXY badge is the icon.
- Don't make the scanline overlay visible on the action palette — terminal only.
- Don't use all-caps for card titles or descriptions. Reserve uppercase for terminal labels ("USER PROMPT", "THOUGHT PROCESS") and section headers.
