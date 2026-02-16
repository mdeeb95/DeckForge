<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, projectName, navigate, screenCards } from '../stores/app';
  import { entries, status, cost } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { loadPredictions } from '../stores/prediction';
  import type { Category } from '../prediction/types';
  import type { TerminalEntry } from '../stores/terminal';

  onMount(() => {
    entries.clear();

    const name = get(projectName) || 'project';
    const bootEntries: TerminalEntry[] = [
      { type: 'timestamp', time: '14:20:01', message: 'DeckForge v0.1.0 initialized' },
      { type: 'timestamp', time: '14:20:01', message: 'Scanning project workspace...' },
      { type: 'timestamp', time: '14:20:02', message: 'Detected: <span class="text-slate-300">TypeScript + React + Vite</span>' },
      { type: 'timestamp', time: '14:20:02', message: 'Git status: on branch <span class="text-secondary">main</span> — clean' },
      { type: 'timestamp', time: '14:20:03', message: 'Claude Code SDK connected <span class="text-emerald-400">✓</span>' },
      { type: 'timestamp', time: '14:20:03', message: 'Prediction engine warming up...' },
      { type: 'prompt', label: 'SYSTEM', body: 'Ready. Select a category to begin. Predictions loaded for 4 categories.' },
      { type: 'thought', label: 'CONTEXT', body: `Analyzing <span class="text-slate-300 bg-slate-800 px-1 rounded">${name}</span> — 47 files, 12 open issues, last commit 2h ago. Generating suggestions across <span class="text-primary">Feature</span>, <span class="text-secondary">Bug</span>, <span class="text-slate-300">Tech Debt</span>, and <span class="text-amber-400">Yolo</span> categories.` },
      { type: 'code', filePath: 'project summary', diff: false, content: `Last session:  3 features shipped, 1 bug fixed\nOpen issues:   12 (4 bugs, 5 features, 3 tech debt)\nTest coverage: 74% (target: 80%)\nBundle size:   248kb (under budget)\nLast deploy:   2 hours ago ✓` },
      { type: 'cursor', message: 'Awaiting category selection...' },
    ];

    status.set('idle');
    cost.set('$0.00');
    bootEntries.forEach(e => entries.addEntry(e));
  });

  function selectCategory(category: Category) {
    // Start loading predictions before navigating (fires async, doesn't block)
    loadPredictions(category);
    navigate('level2');
  }

  // Level 1 category cards — all 4 get branded colors per style guide section 13
  const cards = [
    {
      button: 'A',
      title: 'Feature',
      description: 'build something new',
      pills: [{ label: '8 suggestions', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => selectCategory('feature'),
    },
    {
      button: 'B',
      title: 'Bug',
      description: 'fix something broken',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => selectCategory('bug'),
    },
    {
      button: 'X',
      title: 'Tech Debt',
      description: 'pay down the mess',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => selectCategory('tech_debt'),
    },
    {
      button: 'Y',
      title: 'Yolo',
      description: 'surprise me, I\'m feeling lucky',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => selectCategory('yolo'),
    },
  ];

  const secondaryCards = [
    { button: 'START', label: 'QA Mode', icon: 'checklist' },
    { button: 'SELECT', label: 'History', icon: 'history' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />
<ActionPalette
  title="What Are We Doing?"
  subtitle="Pick a category to see suggestions"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
/>
