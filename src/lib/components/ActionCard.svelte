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
  }

  let {
    button,
    title,
    description,
    pills = [],
    selected = false,
    variant = 'neutral',
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
  <div class="relative group cursor-pointer">
    <!-- Selection Indicator -->
    <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
    <div class="bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
      <div class="absolute top-0 right-0 p-1.5 bg-primary text-black rounded-bl font-bold text-xs shadow-sm">{button}</div>
      <h3 class="text-primary font-bold text-sm mb-1 pr-6">{title}</h3>
      <p class="text-xs text-slate-300 leading-snug mb-2 italic">{description}</p>
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
  <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
    <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative transition-all">
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
