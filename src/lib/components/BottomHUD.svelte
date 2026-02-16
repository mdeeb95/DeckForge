<script lang="ts">
  interface HudHint {
    key: string;
    label: string;
  }

  interface Props {
    hints?: HudHint[];
  }

  let { hints = [
    { key: 'START', label: 'Menu' },
    { key: 'SELECT', label: 'Focus Log' },
    { key: 'D-PAD', label: 'Nav' },
    { key: 'LB+RB', label: 'Voice' },
  ] }: Props = $props();
</script>

<div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
  <div class="glass-panel px-6 py-2 rounded-full border border-surface-border/50 shadow-2xl flex items-center gap-6">
    {#each hints as hint, i}
      {#if hint.key === 'D-PAD'}
        <div class="flex items-center gap-2">
          <div class="grid grid-cols-3 gap-0.5 w-4 h-4 opacity-70">
            <div></div><div class="bg-slate-400 rounded-[1px]"></div><div></div>
            <div class="bg-slate-400 rounded-[1px]"></div><div class="bg-slate-800 rounded-[1px]"></div><div class="bg-slate-400 rounded-[1px]"></div>
            <div></div><div class="bg-slate-400 rounded-[1px]"></div><div></div>
          </div>
          <span class="text-xs font-bold text-slate-300 uppercase tracking-wide">{hint.label}</span>
        </div>
      {:else}
        <div class="flex items-center gap-2">
          <span class="bg-slate-700/50 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono border border-white/10">{hint.key}</span>
          <span class="text-xs font-bold text-slate-300 uppercase tracking-wide">{hint.label}</span>
        </div>
      {/if}
      {#if i < hints.length - 1}
        <div class="w-px h-3 bg-slate-600"></div>
      {/if}
    {/each}
  </div>
</div>
