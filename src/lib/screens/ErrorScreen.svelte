<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import type { TerminalEntry } from '../stores/terminal';
  import { errorDetails, clearError } from '../stores/errorStore';
  import { get } from 'svelte/store';
  import { glyph } from '../input/inputMode.svelte';

  onMount(() => {
    entries.clear();

    const error = get(errorDetails);
    const now = new Date().toTimeString().slice(0, 8);

    if (error) {
      const termEntries: TerminalEntry[] = [
        { type: 'timestamp', time: error.timestamp || now, message: `<span class="text-red-400 font-bold">ERROR: ${error.type}</span>` },
      ];
      if (error.file) {
        termEntries.push({ type: 'timestamp', time: now, message: `File: <span class="text-slate-300">${error.file}</span>` });
      }
      termEntries.push({ type: 'code', filePath: 'error output', diff: false, content: error.output || error.message });
      termEntries.push({ type: 'timestamp', time: now, message: '<span class="text-red-400">Claude Code stopped.</span>' });
      if (error.recoverable) {
        termEntries.push({ type: 'timestamp', time: now, message: '<span class="text-amber-400">This error may be recoverable — retry or go back.</span>' });
      }
      termEntries.push({ type: 'cursor', message: 'Awaiting recovery action...' });
      termEntries.forEach(e => entries.addEntry(e));
      status.set('error');
      scope.set(error.file ? '1 File' : '');
    } else {
      entries.addEntry({ type: 'timestamp', time: now, message: '<span class="text-slate-500">No error details available.</span>' });
      entries.addEntry({ type: 'cursor', message: 'Nothing to show. Press B to go back.' });
      status.set('idle');
    }
  });

  const error = get(errorDetails);

  const cards = [
    {
      title: 'Retry with Fix',
      description: 'Let Claude analyze the error and attempt an automatic fix.',
      pills: [{ label: 'Auto-fix', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => { clearError(); navigate('ai_working'); },
    },
    {
      title: 'Go Back',
      description: 'Return to the main screen.',
      pills: [{ label: 'Navigate', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => { clearError(); navigate('level1'); },
    },
    {
      button: 'X',
      title: 'View Full Error',
      description: 'Expand the complete error output in the terminal.',
      pills: [{ label: 'Debug', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => {
        const err = get(errorDetails);
        if (err) {
          entries.addEntry({
            type: 'prompt',
            label: 'FULL OUTPUT',
            body: 'Complete error output:',
          });
          entries.addEntry({
            type: 'code',
            filePath: err.file || 'error output',
            diff: false,
            content: err.output || err.message,
          });
          entries.addEntry({
            type: 'cursor',
            message: 'Press A to retry or B to go back.',
          });
        }
      },
    },
    {
      title: 'Ignore and Continue',
      description: 'Skip this error and move on. Use with caution.',
      pills: [{ label: 'Risky', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => { clearError(); navigate('level1'); },
    },
  ];

  const secondaryCards: { button: string; label: string; icon: string }[] = [];

  screenCards.set(cards.map(c => ({ ...(c.button ? { button: c.button } : {}), title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />

<!-- Custom Error-tinted Action Palette -->
<aside class="flex-1 min-w-[280px] bg-surface-dark border-l border-red-400/20 flex flex-col z-20 shadow-2xl">
  <div class="p-3 border-b border-red-400/20 bg-surface-dark">
    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Error Recovery</h2>
    <p class="text-[10px] text-slate-600">Something went wrong — choose how to proceed</p>
  </div>

  <div class="flex-1 overflow-hidden min-h-0 p-2 space-y-2">
    {#each cards as card, i}
      {#if i === $selectedCardIndex}
        <!-- Selected: RED-tinted -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="relative group cursor-pointer" onclick={card.onclick}>
          <div class="absolute -left-2 top-0 bottom-0 w-1 bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.6)] rounded-r"></div>
          <div class="bg-[#1c242e] border-2 border-red-400/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
            <h3 class="text-red-400 font-bold text-sm mb-1 truncate">{card.title}</h3>
            <p class="text-xs text-slate-300 leading-snug mb-2">{card.description}</p>
            <div class="flex items-center gap-2 text-[10px]">
              {#each card.pills as pill}
                <span class="bg-red-400/10 text-red-400 px-1.5 py-0.5 rounded border border-red-400/20">{pill.label}</span>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <!-- Unselected: red-tinted borders -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="relative group opacity-80 hover:opacity-100 transition-opacity" onclick={card.onclick}>
          <div class="bg-surface-dark border border-red-400/20 hover:border-slate-600 p-3 rounded relative transition-all">
            <h3 class="text-white font-medium text-sm mb-1 truncate">{card.title}</h3>
            <p class="text-xs text-slate-400 leading-snug mb-2">{card.description}</p>
            <div class="flex items-center gap-2 text-[10px]">
              {#each card.pills as pill}
                {#if pill.variant === 'active'}
                  <span class="bg-red-400/10 text-red-400 px-1.5 py-0.5 rounded border border-red-400/20">{pill.label}</span>
                {:else}
                  <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-red-400/20">{pill.label}</span>
                {/if}
              {/each}
            </div>
          </div>
        </div>
      {/if}
    {/each}

    <!-- Separator -->
    <div class="h-px bg-surface-border my-1"></div>

    <!-- Secondary Cards -->
    {#each secondaryCards as card}
      <div class="relative group">
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">{glyph(card.button)}</div>
            <span class="text-xs text-slate-300 font-medium">{card.label}</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">{card.icon}</span>
        </div>
      </div>
    {/each}
  </div>

  <!-- Bottom hint -->
  <div class="p-2 bg-[#0b0e11] border-t border-surface-border text-center">
    <p class="text-[10px] text-slate-500 font-mono">
      <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('A')}</span> Select
      <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('B')}</span> Back
      <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('X')}</span> View Error
      <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('D-PAD')}</span> Navigate
    </p>
  </div>
</aside>
