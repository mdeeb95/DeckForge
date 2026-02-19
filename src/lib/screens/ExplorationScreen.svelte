<script lang="ts">
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status } from '../stores/terminal';
  import { onMount } from 'svelte';

  onMount(() => {
    entries.clear();

    entries.addEntry({ type: 'timestamp', time: new Date().toTimeString().slice(0, 8), message: '<span class="text-primary">Exploration Mode</span>' });
    entries.addEntry({ type: 'cursor', message: 'Exploration mode — coming soon' });

    status.set('idle');
  });

  const cards = [
    {
      title: 'Ask a Question',
      description: 'Coming soon — read-only codebase Q&A.',
      pills: [{ label: 'Coming soon', variant: 'neutral' as const }],
      variant: 'primary' as const,
      onclick: () => {},
    },
    {
      title: 'Go Back',
      description: 'Return to the previous screen.',
      pills: [{ label: 'Navigate', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => navigate('project_select'),
    },
    {
      title: 'New Topic',
      description: 'Coming soon — fresh conversation threads.',
      pills: [{ label: 'Coming soon', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => {},
    },
    {
      title: 'Surprise Me',
      description: 'Coming soon — find the most cursed code in your project.',
      pills: [{ label: 'Coming soon', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => {},
    },
  ];

  const secondaryCards: { button: string; label: string; icon: string }[] = [];

  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Exploration"
  title="Explore Your Codebase"
  subtitle="Ask questions — no code changes"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  hints={[
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'D-PAD', label: 'Navigate' },
  ]}
/>
