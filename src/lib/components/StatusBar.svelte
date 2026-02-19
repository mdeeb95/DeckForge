<script lang="ts">
  import { cpuUsage, ramUsage } from '../stores/systemStats';
  import { claudeStatus } from '../system/claudeResolver';

  interface Props {
    projectName?: string;
    connected?: boolean;
    version?: string;
  }

  let { projectName = '', connected = false, version = 'v0.1.0' }: Props = $props();
</script>

<header class="h-8 border-b border-surface-border bg-surface-dark flex items-center justify-between px-4 text-xs font-mono uppercase tracking-wider shrink-0 z-20">
  <div class="flex items-center gap-4">
    <span class="text-primary font-bold flex items-center gap-2">
      <span class="material-icons text-sm">terminal</span>
      DeckForge
    </span>
    <span class="text-slate-500">|</span>
    <span class="text-slate-300">Project: <span class="text-white">{projectName || '—'}</span></span>
    <span class="text-slate-500">|</span>
    {#if connected}
      <span class="flex items-center gap-1 text-emerald-400">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Connected
      </span>
    {:else}
      <span class="flex items-center gap-1 text-red-400">
        <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
        Disconnected
      </span>
    {/if}
    <span class="text-slate-500">|</span>
    {#if $claudeStatus === 'searching'}
      <span class="text-slate-500">CLI...</span>
    {:else if $claudeStatus === 'found'}
      <span class="text-emerald-400">CLI</span>
    {:else}
      <span class="text-red-400" title="Claude CLI not found">CLI</span>
    {/if}
  </div>
  <div class="flex items-center gap-4 text-slate-400">
    <span>RAM: {$ramUsage.toFixed(0)}%</span>
    <span>CPU: {$cpuUsage.toFixed(0)}%</span>
    <span class="text-primary">{version}</span>
  </div>
</header>
