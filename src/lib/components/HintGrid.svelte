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
