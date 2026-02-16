<script lang="ts">
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status } from '../stores/terminal';
  import type { TerminalEntry } from '../stores/terminal';
  import { onMount } from 'svelte';

  onMount(() => {
    entries.clear();

    const termEntries: TerminalEntry[] = [
      { type: 'timestamp', time: new Date().toTimeString().slice(0, 8), message: '<span class="text-primary">Exploration Mode</span>' },
      { type: 'prompt', label: 'SYSTEM', body: 'Ask anything about your codebase. Claude will analyze files, explain patterns, and answer questions — without changing any code.' },
      { type: 'cursor', message: 'Select an action to begin exploring...' },
    ];

    status.set('idle');
    termEntries.forEach(e => entries.addEntry(e));
  });

  const cards = [
    {
      button: 'A',
      title: 'Ask a Question',
      description: 'Ask Claude about your codebase, architecture, or implementation details.',
      pills: [{ label: 'Read-only', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => {
        entries.addEntry({ type: 'cursor', message: 'Ask a Question — not yet implemented' });
      },
    },
    {
      button: 'B',
      title: 'Go Back',
      description: 'Return to the previous screen.',
      pills: [{ label: 'Navigate', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => navigate('project_select'),
    },
    {
      button: 'X',
      title: 'New Topic',
      description: 'Start a fresh conversation thread about a different area.',
      pills: [{ label: 'Reset', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => {
        entries.addEntry({ type: 'cursor', message: 'New Topic — not yet implemented' });
      },
    },
    {
      button: 'Y',
      title: 'Surprise Me',
      description: 'Have Claude find the most cursed code in your project.',
      pills: [{ label: 'Chaotic', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => {
        entries.addEntry({ type: 'cursor', message: 'Surprise Me — scanning for cursed code... just kidding, not yet implemented' });
      },
    },
  ];

  const secondaryCards = [
    { button: 'RB', label: 'Save to Notes', icon: 'note_add' },
    { button: 'LB', label: 'Back', icon: 'arrow_back' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Exploration"
  title="Explore Your Codebase"
  subtitle="Ask questions — no code changes"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
/>
