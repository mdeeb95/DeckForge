# Task: Move Bottom HUD Into Right Panel

## Problem

The floating bottom HUD bar ("START MENU | SELECT FOCUS LOG | D-PAD NAV | LB+RB VOICE") takes up valuable viewport space and clutters the AI Working screen. On 1280x800, every pixel counts.

## Solution

Remove the global floating BottomHUD and integrate the button hints as a compact grid into the bottom of the right-side action panel, per screen.

### 1. Remove global BottomHUD from App.svelte

In `src/App.svelte`, remove the `<BottomHUD />` component from the layout. Don't delete the component file yet — we'll reuse parts of it.

Find and remove:
```svelte
<BottomHUD />
```

And remove the import:
```svelte
import BottomHUD from './lib/components/BottomHUD.svelte';
```

### 2. Create a new `HintGrid` component

Create `src/lib/components/HintGrid.svelte` — a compact 2-column grid of button hints that fits inside the right panel's footer area.

```svelte
<script lang="ts">
  interface HintItem {
    key: string;
    label: string;
  }

  interface Props {
    hints?: HintItem[];
  }

  let { hints = [] }: Props = $props();
</script>

{#if hints.length > 0}
  <div class="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 bg-[#0b0e11] border-t border-surface-border">
    {#each hints as hint}
      <div class="flex items-center gap-1.5">
        <span class="bg-slate-700/50 text-slate-400 px-1 py-0.5 rounded text-[9px] font-mono border border-white/10 shrink-0">{hint.key}</span>
        <span class="text-[9px] text-slate-500 uppercase tracking-wide truncate">{hint.label}</span>
      </div>
    {/each}
  </div>
{/if}
```

### 3. Add HintGrid to each screen's right panel

Each screen already has a right-side `<aside>` panel. Add `<HintGrid>` at the bottom of each one with screen-specific hints.

**AIWorkingScreen.svelte** — replace the existing footer `<div class="p-2 bg-[#0b0e11]...">` block with:
```svelte
<HintGrid hints={[
  { key: 'B', label: 'Interrupt' },
  { key: 'START', label: 'Menu' },
  { key: 'SELECT', label: 'Focus Log' },
  { key: 'LB+RB', label: 'Voice' },
]} />
```

**Level1Screen** (if it has a panel):
```svelte
<HintGrid hints={[
  { key: 'A/B/X/Y', label: 'Select' },
  { key: 'D-PAD', label: 'Navigate' },
  { key: 'RB', label: 'Screenshot' },
  { key: 'START', label: 'Menu' },
]} />
```

**Level2Screen**:
```svelte
<HintGrid hints={[
  { key: 'A', label: 'Select' },
  { key: 'B', label: 'Back' },
  { key: 'RB', label: 'Reroll' },
  { key: 'START', label: 'Menu' },
]} />
```

**Level3Screen**:
```svelte
<HintGrid hints={[
  { key: 'A', label: 'Ship It' },
  { key: 'B', label: 'Back' },
  { key: 'X', label: 'Tell Me More' },
  { key: 'Y', label: 'Ship Unhinged' },
]} />
```

**EmptyStateScreen**: This screen doesn't have a right panel, so either:
- Skip hints entirely (cleanest)
- Or add a small absolute-positioned hint row at the very bottom

### 4. Remove BottomHUD.svelte file

After confirming the HintGrid works on all screens, delete `src/lib/components/BottomHUD.svelte`.

## Design Rules
- 9px text, slate-500 labels, slate-700 key badges
- 2-column grid, compact — should take ~24px total height
- Only show on the right panel, never floating
- Screen-specific hints (each screen has different relevant buttons)

## Verification

1. No floating bar at the bottom of any screen
2. Each screen's right panel shows relevant button hints in a tight grid at the bottom
3. Hints don't overlap with action cards or status area
4. Total right panel still fits in 1280x800 viewport without scroll
