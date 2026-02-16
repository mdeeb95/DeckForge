<script lang="ts">
  import { onMount } from 'svelte';
  import {
    entries,
    status,
    cost,
    scope,
    type TerminalStatus,
  } from '../stores/terminal';
  import { splitRatio } from '../stores/app';
  import { setTerminalScrollElement } from '../stores/terminalScroll';

  let contentEl: HTMLDivElement | undefined = $state();

  onMount(() => {
    if (contentEl) setTerminalScrollElement(contentEl);
    return () => setTerminalScrollElement(null);
  });

  const badgeClasses: Record<TerminalStatus, string> = {
    streaming: 'bg-primary/20 text-primary border-primary/30',
    idle: 'bg-slate-800 text-slate-500 border-slate-700',
    complete: 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30',
    error: 'bg-red-400/20 text-red-400 border-red-400/30',
  };

  const badgeLabels: Record<TerminalStatus, string> = {
    streaming: 'STREAMING',
    idle: 'IDLE',
    complete: 'COMPLETE',
    error: 'ERROR',
  };
</script>

<section class="flex flex-col min-w-0 border-r border-surface-border bg-background-dark relative shrink-0" style="width: {$splitRatio}%">
  <!-- Terminal Header -->
  <div class="h-10 flex items-center justify-between px-4 border-b border-surface-border bg-surface-dark/50 shrink-0">
    <div class="flex items-center gap-2">
      <span class="text-primary font-mono text-sm">&gt; Claude Code Stream</span>
      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border {badgeClasses[$status]}">{badgeLabels[$status]}</span>
    </div>
    <div class="flex gap-2">
      <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-surface-border text-[10px] text-slate-400 flex items-center gap-1">
        <span class="material-icons text-[10px]">attach_money</span>
        Session: {$cost}
      </span>
      {#if $scope}
        <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-surface-border text-[10px] text-slate-400 flex items-center gap-1">
          <span class="material-icons text-[10px]">description</span>
          {$scope}
        </span>
      {/if}
    </div>
  </div>

  <!-- Terminal Content -->
  <div bind:this={contentEl} class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed scroll-smooth">
    {#each $entries as entry}
      {#if entry.type === 'timestamp'}
        <div class="flex gap-2 text-slate-500">
          <span class="select-none text-slate-600">{entry.time}</span>
          <span>{@html entry.message}</span>
        </div>

      {:else if entry.type === 'prompt'}
        <div class="mb-6 pl-3 border-l-2 border-primary/50">
          <div class="text-primary font-bold mb-1">{entry.label}</div>
          <div class="text-slate-200">{@html entry.body}</div>
        </div>

      {:else if entry.type === 'thought'}
        <div class="mb-2">
          <span class="text-secondary font-bold">{entry.label}</span>
          <p class="text-slate-400 mt-1 mb-3 max-w-3xl">{@html entry.body}</p>
        </div>

      {:else if entry.type === 'code'}
        <div class="bg-[#0b0e11] border border-surface-border rounded p-3 mb-6 relative">
          {#if entry.filePath}
            <div class="absolute top-2 right-2 text-[10px] text-slate-500">{entry.filePath}</div>
          {/if}
          <pre class="whitespace-pre-wrap break-all text-slate-400"><code>{#if entry.diff}{#each entry.content.split('\n') as line}{#if line.startsWith('+')}<span class="text-green-500">{line}</span>
{:else}{line}
{/if}{/each}{:else}{entry.content}{/if}</code></pre>
        </div>

      {:else if entry.type === 'cursor'}
        <div class="text-slate-400 flex items-center gap-2 animate-pulse">
          <span class="w-2 h-4 bg-primary block"></span>
          <span>{entry.message}</span>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Scanline overlay -->
  <div class="absolute inset-0 scan-overlay z-10 pointer-events-none opacity-20"></div>
</section>
