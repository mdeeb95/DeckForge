<script lang="ts">
  import { selectedCardIndex, navigate, screenCards, projectName, isDemoMode } from '../stores/app';
  import { scaffoldDemoProject } from '../demo/scaffolder';
  import { openProject } from '../stores/configStores';
  import { devLog, devError } from '../utils/devLog';

  let demoStatus = $state<'idle' | 'loading' | 'error'>('idle');
  let demoError = $state('');

  async function openDirectory() {
    devLog('lifecycle', 'Open Directory: starting file dialog');
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Select Project Directory' });
      if (selected) {
        devLog('lifecycle', `Open Directory: selected ${selected}`);
        await openProject(selected as string);
        projectName.set((selected as string).split('/').pop() || 'project');
        navigate('level1');
      } else {
        devLog('lifecycle', 'Open Directory: cancelled by user');
      }
    } catch (e) {
      devError('error', 'Open directory failed', e);
    }
  }

  async function launchDemo() {
    devLog('lifecycle', 'Demo Mode: starting scaffold');
    demoStatus = 'loading';
    isDemoMode.set(true);
    try {
      const path = await scaffoldDemoProject();
      devLog('lifecycle', `Demo Mode: scaffold complete at ${path}`);
      await openProject(path);
      devLog('lifecycle', 'Demo Mode: project opened, navigating to L1');
      projectName.set('pong-demo');
      navigate('level1');
    } catch (e) {
      devError('error', 'Demo Mode scaffold failed', e);
      demoStatus = 'error';
      demoError = e instanceof Error ? e.message : String(e);
      isDemoMode.set(false);
    }
  }

  let demoDesc = $derived(
    demoStatus === 'loading'
      ? 'Setting up Pong demo...'
      : demoStatus === 'error'
        ? `Failed: ${demoError}`
        : 'Scaffold a Pong game and explore DeckForge.'
  );

  screenCards.set([
    { button: 'A', title: 'Open Directory', description: 'Browse and select a project folder from your filesystem.', onclick: openDirectory },
    { button: 'Y', title: 'Demo Mode', description: 'Scaffold a Pong game and explore DeckForge.', onclick: launchDemo },
    { button: 'LB', title: 'Settings', description: 'Configure DeckForge settings.', onclick: () => navigate('settings') },
  ]);
</script>

<div class="flex-1 overflow-hidden bg-background-dark">
<div class="h-full flex items-center justify-center relative">
  <div class="flex flex-col items-center justify-center max-w-sm text-center">
    <!-- Logo -->
    <div class="mb-6">
      <span class="material-icons text-primary drop-shadow-[0_0_10px_rgba(13,242,242,0.3)]" style="font-size: 48px;">terminal</span>
      <h1 class="text-primary font-bold text-2xl font-mono tracking-wide mb-1">DeckForge</h1>
      <span class="text-[10px] text-slate-500 font-mono">v0.1.0</span>
    </div>

    <!-- Message -->
    <h2 class="text-sm font-bold text-white uppercase tracking-widest mb-3">No Projects Found</h2>
    <p class="text-xs text-slate-400 leading-relaxed mb-6">Point DeckForge at a project folder to get started. Open a directory, paste a path, or clone from Git.</p>

    <!-- Action cards -->
    <div class="w-full space-y-2">
      <!-- A: Open Directory -->
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="relative group cursor-pointer" onclick={openDirectory}>
        {#if $selectedCardIndex === 0}
          <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
        {/if}
        <div class="{$selectedCardIndex === 0 ? 'bg-[#1c242e] border-2 border-primary/50 shadow-lg' : 'bg-surface-dark border border-surface-border hover:border-slate-600'} p-3 rounded relative overflow-hidden transition-all">
          <div class="{$selectedCardIndex === 0 ? 'bg-primary text-black rounded-bl font-bold text-xs shadow-sm p-1.5' : 'w-5 h-5 flex items-center justify-center bg-primary/20 text-primary border border-primary/30 rounded-full font-bold text-[10px]'} absolute top-0 right-0 {$selectedCardIndex !== 0 ? 'top-2 right-2' : ''}">A</div>
          <h3 class="{$selectedCardIndex === 0 ? 'text-primary font-bold' : 'text-white font-medium'} text-sm mb-1 pr-6 truncate text-left">Open Directory</h3>
          <p class="{$selectedCardIndex === 0 ? 'text-slate-300' : 'text-slate-400'} text-xs leading-snug mb-2 text-left">Browse and select a project folder from your filesystem.</p>
          <div class="flex items-center gap-2 text-[10px]">
            <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">Recommended</span>
          </div>
        </div>
      </div>

      <!-- B + X: Coming soon row (side by side, greyed out) -->
      <div class="grid grid-cols-2 gap-2 opacity-40 cursor-not-allowed">
        <!-- B: Paste Path -->
        <div class="bg-surface-dark border border-surface-border p-2.5 rounded relative">
          <div class="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center bg-slate-700/40 text-slate-500 border border-slate-600/40 rounded-full font-bold text-[9px]">B</div>
          <h3 class="text-slate-500 font-medium text-xs mb-0.5 pr-5 truncate text-left">Paste a Path</h3>
          <p class="text-slate-600 text-[10px] leading-snug mb-1.5 text-left">Enter a full path.</p>
          <span class="bg-slate-800/50 text-slate-500 px-1.5 py-0.5 rounded border border-surface-border/50 text-[9px]">Coming Soon</span>
        </div>
        <!-- X: Clone from Git -->
        <div class="bg-surface-dark border border-surface-border p-2.5 rounded relative">
          <div class="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center bg-slate-700/40 text-slate-500 border border-slate-600/40 rounded-full font-bold text-[9px]">X</div>
          <h3 class="text-slate-500 font-medium text-xs mb-0.5 pr-5 truncate text-left">Clone from Git</h3>
          <p class="text-slate-600 text-[10px] leading-snug mb-1.5 text-left">Clone a repository.</p>
          <span class="bg-slate-800/50 text-slate-500 px-1.5 py-0.5 rounded border border-surface-border/50 text-[9px]">Coming Soon</span>
        </div>
      </div>

      <!-- Y: Demo Mode (Amber branded -- Y is always ridiculous) -->
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="relative group cursor-pointer" onclick={launchDemo}>
        {#if $selectedCardIndex === 1}
          <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
        {/if}
        <div class="{$selectedCardIndex === 1 ? 'bg-[#1e1a13] border-2 border-primary/50 shadow-lg' : 'bg-[#1e1a13] border border-amber-500/40 hover:border-amber-400/60 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)]'} p-3 rounded relative transition-all">
          <div class="{$selectedCardIndex === 1 ? 'bg-primary text-black rounded-bl font-bold text-xs shadow-sm p-1.5 absolute top-0 right-0' : 'absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full font-bold text-[10px]'}">Y</div>
          <h3 class="{$selectedCardIndex === 1 ? 'text-primary font-bold' : 'text-amber-400 font-medium'} text-sm mb-1 pr-6 truncate text-left {demoStatus === 'loading' ? 'animate-pulse' : ''}">Demo Mode</h3>
          <p class="{$selectedCardIndex === 1 ? 'text-slate-300' : 'text-amber-200/60'} text-xs leading-snug mb-2 text-left {demoStatus === 'error' ? 'text-red-400' : ''}">{demoDesc}</p>
          <div class="flex items-center gap-2 text-[10px]">
            {#if demoStatus === 'loading'}
              <span class="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">Loading...</span>
            {:else if demoStatus === 'error'}
              <span class="bg-red-400/10 text-red-400 px-1.5 py-0.5 rounded border border-red-400/20">Error</span>
            {:else}
              <span class="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">Try it</span>
            {/if}
          </div>
        </div>
      </div>

      <div class="h-px bg-surface-border my-3 w-full"></div>

      <div class="relative group">
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">LB</div>
            <span class="text-xs text-slate-300 font-medium">Settings</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">settings</span>
        </div>
      </div>
      <div class="relative group">
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">RB</div>
            <span class="text-xs text-slate-300 font-medium">Help</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">help_outline</span>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
