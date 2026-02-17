# Prompt: Disable L3 Action Cards Until Plan Is Ready

## Problem
On the Level 3 (Plan Review) screen, all action cards (Ship It, Go Back, Tell Me More, Ship It Unhinged) are immediately interactive while the plan is still generating. The left panel shows "Generating plan..." but the user can already press Ship It, which would send an empty/incomplete plan to Claude Code.

## Fix

### 1. Level3Screen.svelte — Gate onclick on plan readiness

The cards are built in a `$derived.by()` block (line 129). The `plan` variable is already reactive via `let plan = $derived($currentPlan)`. Use this to conditionally set onclick handlers:

```ts
let cards = $derived.by(() => {
  const planReady = plan != null;
  const stepCount = plan?.steps.length ?? 0;
  const scopeLabel = plan?.scope ?? 'decent chunk';

  return [
    {
      button: 'A',
      title: planReady ? 'Ship It' : 'Generating Plan...',
      description: planReady
        ? `Execute the plan as-is. Claude Code will implement all ${stepCount} steps.`
        : 'Waiting for plan to finish generating...',
      pills: planReady
        ? [{ label: scopeLabel, variant: 'active' as const }]
        : [{ label: 'loading', variant: 'neutral' as const }],
      variant: (planReady ? 'primary' : 'neutral') as const,
      onclick: planReady ? () => shipIt() : undefined,
    },
    {
      button: 'B',
      title: 'Nah, Go Back',
      description: 'Return to suggestions. This plan won\'t be saved.',
      pills: [{ label: 'No cost', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: goBack,  // B should ALWAYS work — user can bail anytime
    },
    {
      button: 'X',
      title: 'Tell Me More',
      description: planReady
        ? 'Ask Claude to explain the reasoning behind each step.'
        : 'Available after plan generates.',
      pills: [{ label: 'Clarify', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: planReady ? () => expandPlan() : undefined,
    },
    {
      button: 'Y',
      title: planReady ? 'Ship It Unhinged' : 'Generating...',
      description: planReady
        ? (plan?.unhinged_modifier ?? 'Approve with extra creative freedom.')
        : 'Waiting for plan...',
      pills: planReady
        ? [{ label: 'Unhinged', variant: 'neutral' as const }]
        : [{ label: 'loading', variant: 'neutral' as const }],
      variant: (planReady ? 'amber' : 'neutral') as const,
      onclick: planReady ? () => shipIt(true) : undefined,
    },
  ];
});
```

### 2. ActionCard.svelte — Visual disabled state

Currently ActionCard does NOT handle the disabled case. Both selected and unselected states show `cursor-pointer` and interactive hover effects even when `onclick` is undefined.

Add a disabled check. The card is disabled when `onclick` is undefined.

**For the selected state** (line 39 area), wrap the existing content:
```svelte
{#if selected}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="relative group {onclick ? 'cursor-pointer' : 'cursor-default'}" onclick={onclick}>
    <div class="absolute -left-2 top-0 bottom-0 w-1 {onclick ? 'bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)]' : 'bg-slate-600'} rounded-r"></div>
    <div class="{onclick ? 'bg-[#1c242e] border-2 border-primary/50' : 'bg-[#1a1e24] border-2 border-slate-700'} p-3 rounded shadow-lg relative overflow-hidden transition-all duration-150 {onclick ? 'pulse-glow' : 'opacity-60'}">
      <div class="absolute top-0 right-0 p-1.5 {onclick ? 'bg-primary text-black' : 'bg-slate-700 text-slate-400'} rounded-bl font-bold text-xs shadow-sm">{button}</div>
      <h3 class="{onclick ? 'text-primary' : 'text-slate-500'} font-bold text-sm mb-1 pr-6">{title}</h3>
      <p class="text-xs {onclick ? 'text-slate-300' : 'text-slate-600'} leading-snug mb-2 italic">{description}</p>
      <!-- pills unchanged -->
```

**For the unselected state** (line 59 area):
```svelte
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="relative group {onclick ? 'opacity-80 hover:opacity-100' : 'opacity-40 cursor-default'} transition-opacity" onclick={onclick}>
    <div class="bg-surface-dark border {onclick ? 'border-surface-border hover:border-slate-600' : 'border-surface-border'} p-3 rounded relative transition-all duration-150">
      <!-- ... rest unchanged -->
```

The key changes:
- `cursor-pointer` → `cursor-default` when no onclick
- `opacity-80` → `opacity-40` when disabled
- Remove `hover:opacity-100` and `hover:border-slate-600` when disabled
- Selected disabled: muted colors instead of cyan glow
- No `pulse-glow` class when disabled

### 3. Keep Go Back (B) always active
The B card in the array above always has `onclick: goBack` regardless of `planReady`. This is intentional — the user should always be able to bail out.

### 4. shipIt() guard is already in place
Line 62-63 already has `if (!plan) return;` — this is the safety net. Keep it.

## Important Notes
- Use Svelte 5 syntax (`$state`, `$derived`, `$effect`) — the codebase already uses it
- `plan` is already reactive via `let plan = $derived($currentPlan)` — the cards auto-update when plan loads
- Do NOT add scroll — 1280×800 is fixed
- B (Go Back) must ALWAYS work regardless of plan state
- ActionPalette variant type union may need `'neutral'` added if not already there
- Run `npm test` after changes
