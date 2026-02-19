<script lang="ts">
  import ActionCard from './ActionCard.svelte';
  import SecondaryCard from './SecondaryCard.svelte';
  import HintGrid from './HintGrid.svelte';

  interface CardData {
    button?: string;
    title: string;
    description: string;
    pills: { label: string; variant: 'active' | 'neutral' }[];
    variant: 'primary' | 'secondary_pink' | 'neutral' | 'amber';
    onclick?: () => void;
  }

  interface SecondaryCardData {
    button: string;
    label: string;
    icon: string;
    variant?: 'default' | 'emerald';
    onclick?: () => void;
  }

  interface Props {
    title?: string;
    subtitle?: string;
    breadcrumb?: string;
    step?: number;
    cards?: CardData[];
    secondaryCards?: SecondaryCardData[];
    selectedIndex?: number;
    animatingIndex?: number | null;
    animationType?: 'glitch' | 'confirm' | 'dismiss' | 'pulse' | null;
    hints?: { key: string; label: string }[];
  }

  let {
    title = '',
    subtitle = '',
    breadcrumb = '',
    step = 0,
    cards = [],
    secondaryCards = [],
    selectedIndex = 0,
    animatingIndex = null,
    animationType = null,
    hints = [],
  }: Props = $props();

  // Track card switch animations
  let prevIndex = $state(-1);
  let enteringIndex = $state(-1);
  let exitingIndex = $state(-1);

  $effect(() => {
    // Don't trigger switch animation during action animations
    if (animatingIndex != null) return;

    if (selectedIndex !== prevIndex && prevIndex >= 0) {
      exitingIndex = prevIndex;
      enteringIndex = selectedIndex;

      // Clear transition flags after animation completes
      setTimeout(() => {
        exitingIndex = -1;
        enteringIndex = -1;
      }, 320);
    }
    prevIndex = selectedIndex;
  });
</script>

<aside class="flex-1 min-w-[280px] bg-surface-dark border-l border-surface-border flex flex-col z-20 shadow-2xl">
  {#if title}
    <div class="p-3 border-b border-surface-border bg-surface-dark">
      {#if breadcrumb}
        <div class="flex items-center gap-2 mb-1">
          <span class="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none">{breadcrumb}</span>
          {#if step >= 1 && step <= 3}
            <div class="flex items-center gap-1">
              {#each [1, 2, 3] as dot}
                <div class="w-1 h-1 rounded-full {dot === step ? 'bg-primary' : 'bg-slate-600'}"></div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</h2>
      {#if subtitle}
        <p class="text-[10px] text-slate-600">{subtitle}</p>
      {/if}
    </div>
  {/if}

  <div class="flex-1 overflow-hidden min-h-0 p-2 space-y-2">
    {#each cards as card, i}
      <ActionCard
        button={card.button}
        title={card.title}
        description={card.description}
        pills={card.pills}
        selected={i === selectedIndex}
        variant={card.variant}
        onclick={card.onclick}
        animationType={i === animatingIndex ? animationType : null}
        switchAnimation={i === enteringIndex ? 'zoom-in' : i === exitingIndex ? 'zoom-out' : null}
      />
    {/each}

    {#if secondaryCards.length > 0}
      <!-- Separator -->
      <div class="h-px bg-surface-border my-1"></div>

      {#each secondaryCards as card}
        <SecondaryCard
          button={card.button}
          label={card.label}
          icon={card.icon}
          variant={card.variant}
          onclick={card.onclick}
        />
      {/each}
    {/if}
  </div>

  <HintGrid {hints} />
</aside>
