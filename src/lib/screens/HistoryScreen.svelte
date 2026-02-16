<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import type { TerminalEntry } from '../stores/terminal';

  onMount(() => {
    entries.clear();
    const historyEntries: TerminalEntry[] = [
      { type: 'thought', label: 'CURRENT STATE', body: 'QA approved: Add Search and Filter ✓' },
      { type: 'timestamp', time: '14:35:12', message: '<span class="text-primary font-bold">Current state</span>' },
      { type: 'timestamp', time: '14:30:45', message: 'Executed: Add Search and Filter (5 steps)' },
      { type: 'timestamp', time: '14:28:10', message: '<span class="text-slate-400">Plan confirmed: Add Search and Filter</span>' },
      { type: 'timestamp', time: '14:25:33', message: '<span class="text-slate-400">Selected: Feature > Add Search and Filter</span>' },
      { type: 'timestamp', time: '14:20:15', message: '<span class="text-slate-500">Rejected: Refactor UI Components</span>' },
      { type: 'timestamp', time: '14:18:00', message: '<span class="text-slate-500">Session started</span>' },
      { type: 'prompt', label: 'TIMELINE SUMMARY', body: '6 actions · 1 rejection · Session cost: $0.12' },
      { type: 'cursor', message: 'Navigate timeline...' },
    ];
    status.set('idle');
    cost.set('$0.12');
    scope.set('History');
    historyEntries.forEach(e => entries.addEntry(e));
  });

  const cards = [
    {
      button: 'A',
      title: 'Undo Last Action',
      description: "Revert 'QA approved: Add Search and Filter'. Code changes will be rolled back.",
      pills: [{ label: 'Reversible', variant: 'active' as const }],
      variant: 'primary' as const,
    },
    {
      button: 'B',
      title: 'Redo',
      description: 'Re-apply the most recently undone action.',
      pills: [{ label: 'No undone actions', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
    },
    {
      button: 'X',
      title: 'Inspect Diff',
      description: 'View the code changes made by this action.',
      pills: [{ label: '3 files', variant: 'neutral' as const }],
      variant: 'neutral' as const,
    },
    {
      button: 'Y',
      title: 'Jump to State',
      description: 'Restore the project to this exact point in time.',
      pills: [{ label: 'Snapshot', variant: 'neutral' as const }],
      variant: 'neutral' as const,
    },
  ];

  const secondaryCards = [
    { button: 'RB', label: 'Clear History', icon: 'delete_sweep' },
    { button: 'LB', label: 'Export Session Log', icon: 'download' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description })));
</script>

<TerminalPanel />
<ActionPalette
  title="Timeline Actions"
  subtitle="Undo, redo, or inspect past actions"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
/>
