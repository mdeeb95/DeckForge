<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    entries,
    status,
    cost,
    scope,
    activeTab,
    type TerminalStatus,
  } from '../stores/terminal';
  import { appOutput, appRunning, appPid } from '../stores/launcher';
  import { splitRatio } from '../stores/app';
  import { setTerminalScrollElement } from '../stores/terminalScroll';

  let contentEl: HTMLDivElement | undefined = $state();

  onMount(() => {
    if (contentEl) setTerminalScrollElement(contentEl);
    return () => setTerminalScrollElement(null);
  });

  // Auto-scroll to bottom when entries or app output change
  $effect(() => {
    const _ = $activeTab === 'claude' ? $entries : $appOutput;
    if (contentEl) {
      // Wait for Svelte to flush DOM updates, THEN scroll
      tick().then(() => {
        requestAnimationFrame(() => {
          if (contentEl) {
            contentEl.scrollTop = contentEl.scrollHeight;
          }
        });
      });
    }
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

  function getAppLineClass(line: string): string {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('err!') || lower.includes('failed')) return 'text-red-400';
    if (lower.includes('warn')) return 'text-amber-400';
    if (lower.includes('listening') || lower.includes('started') || lower.includes('ready')) return 'text-emerald-400';
    if (/\b(GET|POST|PUT|DELETE|PATCH)\b/.test(line)) return 'text-blue-400';
    return 'text-slate-400';
  }
</script>

<section class="flex flex-col min-w-0 border-r border-surface-border bg-background-dark relative shrink-0" style="width: {$splitRatio}%">
  <!-- Terminal Header -->
  <div class="h-10 flex items-center justify-between px-4 border-b border-surface-border bg-surface-dark/50 shrink-0">
    <div class="flex items-center gap-2">
      {#if $activeTab === 'claude'}
        <span class="text-primary font-mono text-sm">&gt; Claude Code Stream</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border {badgeClasses[$status]}">{badgeLabels[$status]}</span>
      {:else}
        <span class="text-primary font-mono text-sm">&gt; App Output</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border
          {$appRunning ? 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30' : 'bg-slate-800 text-slate-500 border-slate-700'}">
          {$appRunning ? 'RUNNING' : 'STOPPED'}
        </span>
      {/if}
    </div>
    <div class="flex gap-2">
      {#if $activeTab === 'claude'}
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
      {:else if $appPid}
        <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-surface-border text-[10px] text-slate-400">
          PID: {$appPid}
        </span>
      {/if}
    </div>
  </div>

  <!-- Tab Bar -->
  <div class="flex border-b border-surface-border bg-surface-dark/30 shrink-0">
    <button
      class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors
        {$activeTab === 'claude' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-300'}"
      onclick={() => activeTab.set('claude')}
    >
      Claude Code
    </button>
    <button
      class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5
        {$activeTab === 'app' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-300'}"
      onclick={() => activeTab.set('app')}
    >
      App Output
      {#if $appRunning}
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
      {/if}
    </button>
  </div>

  <!-- Terminal Content -->
  <div bind:this={contentEl} class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed scroll-smooth">
    {#if $activeTab === 'claude'}
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
            {#if entry.label}
              <span class="text-secondary font-bold">{entry.label}</span>
            {/if}
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

        {:else if entry.type === 'tool_call'}
          {#if entry.toolName}
            <!-- Tool header with colored indicator -->
            <div class="flex items-center gap-2 mt-3 mb-1">
              <span class="{entry.headerClass} text-sm">{'\u23FA'}</span>
              <span class="{entry.headerClass} font-bold text-xs">{entry.toolName}</span>
              {#if entry.summary}
                <span class="text-slate-300 text-xs truncate">{entry.summary}</span>
              {/if}
            </div>
          {/if}
          {#if entry.meta}
            <div class="text-slate-600 text-xs ml-5">{entry.meta}</div>
          {/if}
          {#if entry.content}
            <div class="bg-[#0b0e11] border border-surface-border rounded p-2 ml-5 mb-2 text-xs">
              <pre class="whitespace-pre-wrap break-all text-slate-400"><code>{#if entry.isDiff}{#each entry.content.split('\n') as line}{#if line.startsWith('+')}<span class="text-green-500">{line}</span>
{:else if line.startsWith('-')}<span class="text-red-400">{line}</span>
{:else}{line}
{/if}{/each}{:else}{entry.content}{/if}</code></pre>
            </div>
          {/if}

        {:else if entry.type === 'thinking'}
          <div class="flex items-center gap-2 text-slate-500 my-2">
            <span class="thinking-dots font-mono text-primary">
              <span>.</span><span>.</span><span>.</span>
            </span>
            <span class="text-slate-500 italic">{entry.message}</span>
          </div>

        {:else if entry.type === 'cursor'}
          <div class="text-slate-400 flex items-center gap-2 animate-pulse">
            <span class="w-2 h-4 bg-primary block"></span>
            <span>{entry.message}</span>
          </div>
        {/if}
      {/each}
    {:else}
      <!-- App Output -->
      {#if $appOutput.length === 0}
        <div class="text-slate-500 italic">
          {$appRunning ? 'Waiting for output...' : 'No app running. Press R4 to launch.'}
        </div>
      {:else}
        {#each $appOutput as line}
          <div class={getAppLineClass(line)}>{line}</div>
        {/each}
      {/if}
    {/if}
  </div>

  <!-- Scanline overlay (pulses when streaming) -->
  <div class="absolute inset-0 scan-overlay z-10 pointer-events-none {$status === 'streaming' ? 'scan-overlay-streaming' : 'opacity-20'}"></div>
</section>
