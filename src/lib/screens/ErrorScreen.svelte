<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import type { TerminalEntry } from '../stores/terminal';

  onMount(() => {
    entries.clear();
    const errorEntries: TerminalEntry[] = [
      { type: 'timestamp', time: '10:44:22', message: 'Modifying auth.ts...' },
      { type: 'timestamp', time: '10:44:25', message: 'Running linter...' },
      { type: 'timestamp', time: '10:44:28', message: '<span class="text-red-400 font-bold">ERROR: TypeScript compilation failed</span>' },
      { type: 'code', filePath: 'error output', diff: false, content: `error TS2345: Argument of type 'string' is not assignable
  to parameter of type 'AuthConfig'.

  src/middleware/auth.ts:47:12
    47 │ validateToken(rawToken)
       │               ~~~~~~~~` },
      { type: 'timestamp', time: '10:44:29', message: '<span class="text-red-400">Claude Code stopped.</span>' },
      { type: 'timestamp', time: '10:44:30', message: '1 error found. The change could not be completed safely.' },
      { type: 'timestamp', time: '10:44:31', message: '<span class="text-amber-400">Automatically reverted: auth.ts → last known good state</span>' },
      { type: 'cursor', message: 'Awaiting recovery action...' },
    ];
    status.set('error');
    cost.set('$0.03');
    scope.set('1 File');
    errorEntries.forEach(e => entries.addEntry(e));
  });

  const cards = [
    {
      button: 'A',
      title: 'Retry with Fix',
      description: 'Let Claude analyze the error and attempt an automatic fix.',
      pills: [{ label: 'Auto-fix', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => navigate('ai_working'),
    },
    {
      button: 'B',
      title: 'Undo and Go Back',
      description: 'Revert all changes and return to suggestions.',
      pills: [{ label: 'Safe revert', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => navigate('level2'),
    },
    {
      button: 'X',
      title: 'View Error Details',
      description: 'Show the full error log and stack trace.',
      pills: [{ label: 'Debug', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => {
        // Re-render the full error details in the terminal
        entries.addEntry({
          type: 'prompt',
          label: 'EXPANDED ERROR',
          body: 'Full error details shown below:',
        });
        entries.addEntry({
          type: 'code',
          filePath: 'error stack trace',
          diff: false,
          content: `error TS2345: Argument of type 'string' is not assignable
  to parameter of type 'AuthConfig'.

  src/middleware/auth.ts:47:12
    47 │ validateToken(rawToken)
       │               ~~~~~~~~

  The function validateToken() expects an AuthConfig object
  but received a raw string token. This was introduced when
  the auth refactor changed the parameter type.

  Suggested fix: Wrap rawToken in { token: rawToken } before
  passing to validateToken().`,
        });
        entries.addEntry({
          type: 'cursor',
          message: 'Error details expanded. Press A to retry or B to go back.',
        });
      },
    },
    {
      button: 'Y',
      title: 'Ignore and Continue',
      description: 'Skip this error and continue with remaining tasks. Use with caution.',
      pills: [{ label: 'Risky', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => navigate('level1'),
    },
  ];

  const secondaryCards = [
    { button: 'RB', label: 'Report Bug', icon: 'bug_report' },
    { button: 'LB', label: 'Copy Error Log', icon: 'content_copy' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
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
            <div class="absolute top-0 right-0 p-1.5 bg-red-400 text-black rounded-bl font-bold text-xs shadow-sm">{card.button}</div>
            <h3 class="text-red-400 font-bold text-sm mb-1 pr-6 truncate">{card.title}</h3>
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
            <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center {
              card.variant === 'secondary_pink' ? 'bg-secondary/20 text-secondary border border-secondary/30' :
              card.variant === 'amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              'bg-slate-700 text-slate-300 border border-slate-600'
            } rounded-full font-bold text-[10px]">{card.button}</div>
            <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate">{card.title}</h3>
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
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">{card.button}</div>
            <span class="text-xs text-slate-300 font-medium">{card.label}</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">{card.icon}</span>
        </div>
      </div>
    {/each}
  </div>

  <!-- Bottom hint -->
  <div class="p-2 bg-[#0b0e11] border-t border-surface-border text-center">
    <p class="text-[10px] text-slate-500 font-mono">Use <span class="bg-slate-700 text-white px-1 rounded mx-0.5">D-PAD</span> to navigate cards</p>
  </div>
</aside>
