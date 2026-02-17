<script lang="ts">
  import ActionCard from './ActionCard.svelte';
  import SecondaryCard from './SecondaryCard.svelte';

  interface CardData {
    button: string;
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
  }

  interface Props {
    title?: string;
    subtitle?: string;
    breadcrumb?: string;
    step?: number;
    cards?: CardData[];
    secondaryCards?: SecondaryCardData[];
    selectedIndex?: number;
    animatingButton?: string | null;
    animationType?: 'glitch' | 'confirm' | null;
  }

  let {
    title = '',
    subtitle = '',
    breadcrumb = '',
    step = 0,
    cards = [],
    secondaryCards = [],
    selectedIndex = 0,
    animatingButton = null,
    animationType = null,
  }: Props = $props();
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
        animationType={card.button === animatingButton ? animationType : null}
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
        />
      {/each}
    {/if}
  </div>

  <!-- Bottom Action Hint -->
  <div class="p-2 bg-[#0b0e11] border-t border-surface-border text-center">
    <p class="text-[10px] text-slate-500 font-mono">
      Use <span class="bg-slate-700 text-white px-1 rounded mx-0.5">D-PAD</span> to navigate &middot; <span class="bg-slate-700 text-white px-1 rounded mx-0.5">A</span> to select
    </p>
  </div>
</aside>
