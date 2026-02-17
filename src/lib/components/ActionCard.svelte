<script lang="ts">
  interface Pill {
    label: string;
    variant: 'active' | 'neutral';
  }

  interface Props {
    button: string;
    title: string;
    description: string;
    pills?: Pill[];
    selected?: boolean;
    variant?: 'primary' | 'secondary_pink' | 'neutral' | 'amber';
    onclick?: () => void;
    animationType?: 'glitch' | 'confirm' | 'dismiss' | 'pulse' | null;
    switchAnimation?: 'zoom-in' | 'zoom-out' | null;
  }

  let {
    button,
    title,
    description,
    pills = [],
    selected = false,
    variant = 'neutral',
    onclick,
    animationType = null,
    switchAnimation = null,
  }: Props = $props();

  const unselectedBadgeClasses: Record<string, string> = {
    secondary_pink: 'bg-secondary/20 text-secondary border border-secondary/30',
    neutral: 'bg-slate-700 text-slate-300 border border-slate-600',
    amber: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    primary: 'bg-primary/20 text-primary border border-primary/30',
  };
</script>

{#if selected}
  <!-- SELECTED STATE -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative group {onclick ? 'cursor-pointer' : 'cursor-default'} {animationType === 'glitch' ? 'ship-glitch-warp' : ''} {animationType === 'dismiss' ? 'card-dismiss' : ''} {switchAnimation === 'zoom-in' ? 'card-warp-in' : ''}"
    onclick={onclick}
  >
    <!-- Selection Indicator -->
    <div class="absolute -left-2 top-0 bottom-0 w-1 {onclick ? 'bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)]' : 'bg-slate-600'} rounded-r"></div>
    <div class="{onclick ? 'bg-[#1c242e] border-2 border-primary/50' : 'bg-[#1a1e24] border-2 border-slate-700'} p-3 rounded shadow-lg relative overflow-hidden transition-all duration-150 {onclick ? 'pulse-glow' : 'opacity-60'} {animationType === 'confirm' ? 'ship-confirm-border' : ''} {animationType === 'pulse' ? 'card-info-pulse' : ''}">
      <!-- Glitch Warp: scanline overlay -->
      {#if animationType === 'glitch'}
        <div class="ship-scanline"></div>
        <div class="ship-crt-overlay"></div>
      {/if}

      <!-- Confirm Pulse: expanding ring -->
      {#if animationType === 'confirm'}
        <div class="ship-pulse-ring"></div>
      {/if}

      <div class="absolute top-0 right-0 p-1.5 {onclick ? 'bg-primary text-black' : 'bg-slate-700 text-slate-400'} rounded-bl font-bold text-xs shadow-sm">{button}</div>
      <div class="flex items-center gap-1.5">
        <h3 class="{onclick ? 'text-primary' : 'text-slate-500'} font-bold text-sm mb-1 pr-6">{title}</h3>
        <!-- Confirm Pulse: checkmark SVG -->
        {#if animationType === 'confirm'}
          <svg class="ship-checkmark" width="16" height="16" viewBox="0 0 16 16">
            <path d="M3 8 L7 12 L13 4" fill="none" stroke="#0df2f2" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24"
              stroke-dashoffset="24" />
          </svg>
        {/if}
      </div>
      <p class="text-xs {onclick ? 'text-slate-300' : 'text-slate-600'} leading-snug mb-2 italic">{description}</p>
      {#if pills.length > 0}
        <div class="flex items-center gap-2 text-[10px]">
          {#each pills as pill}
            <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{pill.label}</span>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{:else}
  <!-- UNSELECTED STATE -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="relative group {onclick ? 'opacity-80 hover:opacity-100' : 'opacity-40 cursor-default'} transition-opacity {animationType === 'glitch' ? 'ship-glitch-warp' : ''} {animationType === 'dismiss' ? 'card-dismiss' : ''} {switchAnimation === 'zoom-out' ? 'card-warp-out' : ''}" onclick={onclick}>
    <div class="bg-surface-dark border {onclick ? 'border-surface-border hover:border-slate-600' : 'border-surface-border'} p-3 rounded relative transition-all duration-150 {animationType === 'confirm' ? 'ship-confirm-border' : ''} {animationType === 'pulse' ? 'card-info-pulse' : ''}">
      <!-- Glitch Warp: scanline overlay -->
      {#if animationType === 'glitch'}
        <div class="ship-scanline"></div>
        <div class="ship-crt-overlay"></div>
      {/if}

      <!-- Confirm Pulse: expanding ring -->
      {#if animationType === 'confirm'}
        <div class="ship-pulse-ring"></div>
      {/if}

      <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center {unselectedBadgeClasses[variant]} rounded-full font-bold text-[10px]">{button}</div>
      <h3 class="text-white font-medium text-sm mb-1 pr-6">{title}</h3>
      <p class="text-xs text-slate-400 leading-snug mb-2 italic">{description}</p>
      {#if pills.length > 0}
        <div class="flex items-center gap-2 text-[10px]">
          {#each pills as pill}
            {#if pill.variant === 'active'}
              <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{pill.label}</span>
            {:else}
              <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">{pill.label}</span>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ── Glitch Warp Animation ── */
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

  @keyframes scanline-move {
    0% { top: -10%; }
    100% { top: 110%; }
  }

  :global(.ship-glitch-warp) {
    animation: glitch-warp 450ms steps(1) forwards;
  }

  .ship-scanline {
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    background: #0df2f2;
    z-index: 10;
    pointer-events: none;
    animation: scanline-move 200ms linear infinite;
  }

  .ship-crt-overlay {
    position: absolute;
    inset: 0;
    z-index: 9;
    pointer-events: none;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(13, 242, 242, 0.03) 2px,
      rgba(13, 242, 242, 0.03) 4px
    );
  }

  /* ── Confirm Pulse Animation ── */
  @keyframes border-ignite {
    0% { border-color: #30363d; box-shadow: none; }
    30% { border-color: #0df2f2; box-shadow: 0 0 20px rgba(13, 242, 242, 0.25), inset 0 0 20px rgba(13, 242, 242, 0.06); }
    100% { border-color: rgba(13, 242, 242, 0.5); box-shadow: 0 0 10px rgba(13, 242, 242, 0.12); }
  }

  @keyframes check-draw {
    0% { stroke-dashoffset: 24; opacity: 0; }
    40% { stroke-dashoffset: 24; opacity: 0; }
    50% { opacity: 1; }
    100% { stroke-dashoffset: 0; opacity: 1; }
  }

  @keyframes pulse-ring {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.5); opacity: 0; }
  }

  :global(.ship-confirm-border) {
    animation: border-ignite 450ms ease-out forwards !important;
  }

  .ship-checkmark path {
    animation: check-draw 450ms ease-out forwards;
  }

  .ship-pulse-ring {
    position: absolute;
    inset: 0;
    border: 2px solid #0df2f2;
    border-radius: inherit;
    z-index: 10;
    pointer-events: none;
    animation: pulse-ring 600ms ease-out forwards;
  }

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

  :global(.card-warp-out) {
    animation: warp-zoom-out 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  :global(.card-warp-in) {
    animation: warp-zoom-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
               warp-glow 400ms ease-out forwards;
  }
</style>
