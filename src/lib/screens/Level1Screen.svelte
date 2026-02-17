<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, projectName, navigate, screenCards } from '../stores/app';
  import { entries, status, cost } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { loadPredictions } from '../stores/prediction';
  import type { Category } from '../prediction/types';
  import type { TerminalEntry } from '../stores/terminal';
  import { getRandomMessage } from '../personality/messages';
  import { appRunning, appPid } from '../stores/launcher';
  import { projectConfig } from '../stores/configStores';
  import { launchApp, restartApp, isRunning } from '../system/appLauncher';

  let abortController: AbortController;

  onMount(() => {
    abortController = new AbortController();
    entries.clear();

    const name = get(projectName) || 'project';
    const now = new Date().toTimeString().slice(0, 8);
    const splash = getRandomMessage('splash');
    const boot = getRandomMessage('boot');
    const bootEntries: TerminalEntry[] = [
      { type: 'timestamp', time: now, message: boot },
      { type: 'timestamp', time: now, message: 'Scanning project workspace...' },
      { type: 'timestamp', time: now, message: 'Detected: <span class="text-slate-300">TypeScript + React + Vite</span>' },
      { type: 'timestamp', time: now, message: 'Git status: on branch <span class="text-secondary">main</span> — clean' },
      { type: 'timestamp', time: now, message: 'Claude Code SDK connected <span class="text-emerald-400">&#10003;</span>' },
      { type: 'timestamp', time: now, message: 'Prediction engine warming up...' },
      { type: 'prompt', label: 'SYSTEM', body: splash },
      { type: 'thought', label: 'CONTEXT', body: `Analyzing <span class="text-slate-300 bg-slate-800 px-1 rounded">${name}</span> — 47 files, 12 open issues, last commit 2h ago. Generating suggestions across <span class="text-primary">Feature</span>, <span class="text-secondary">Bug</span>, <span class="text-slate-300">Tech Debt</span>, and <span class="text-amber-400">Yolo</span> categories.` },
      { type: 'code', filePath: 'project summary', diff: false, content: `Last session:  3 features shipped, 1 bug fixed\nOpen issues:   12 (4 bugs, 5 features, 3 tech debt)\nTest coverage: 74% (target: 80%)\nBundle size:   248kb (under budget)\nLast deploy:   2 hours ago` },
      { type: 'cursor', message: 'Awaiting category selection...' },
    ];

    status.set('idle');
    cost.set('$0.00');
    bootEntries.forEach(e => entries.addEntry(e));
  });

  onDestroy(() => {
    abortController.abort();
  });

  let animatingType = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
  let animatingButton = $state<string | null>(null);

  function selectCategory(category: Category, button: string) {
    if (animatingType) return;

    // Y (YOLO) always gets glitch — design rule: Y is always ridiculous
    const anim = button === 'Y' ? 'glitch' : 'confirm';
    const duration = button === 'Y' ? 450 : 350;

    animatingType = anim;
    animatingButton = button;
    screenCards.set([]); // lock gamepad during animation

    // Start loading predictions before navigating (fires async, doesn't block)
    loadPredictions(category, abortController.signal);

    setTimeout(() => {
      animatingType = null;
      animatingButton = null;
      navigate('level2');
    }, duration);
  }

  // Level 1 category cards — all 4 get branded colors per style guide section 13
  const cards = [
    {
      button: 'A',
      title: 'Feature',
      description: 'build something new',
      pills: [{ label: '8 suggestions', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => selectCategory('feature', 'A'),
    },
    {
      button: 'B',
      title: 'Bug',
      description: 'fix something broken',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => selectCategory('bug', 'B'),
    },
    {
      button: 'X',
      title: 'Tech Debt',
      description: 'pay down the mess',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => selectCategory('tech_debt', 'X'),
    },
    {
      button: 'Y',
      title: 'Yolo',
      description: 'surprise me, I\'m feeling lucky',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => selectCategory('yolo', 'Y'),
    },
  ];

  function runApp() {
    if (isRunning()) {
      restartApp();
    } else {
      const config = get(projectConfig);
      const cmd = config?.run_config?.command;
      const cwd = config?.run_config?.working_directory || config?.project?.path || '.';
      if (cmd) {
        launchApp(cmd, cwd);
      }
    }
  }

  let secondaryCards = $derived([
    { button: 'START', label: 'QA Mode', icon: 'checklist' },
    { button: 'R4', label: $appRunning ? `App Running (PID ${$appPid})` : 'Run App', icon: $appRunning ? 'stop_circle' : 'play_arrow', variant: 'emerald' as const },
    { button: 'SELECT', label: 'History', icon: 'history' },
  ]);

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Category Select"
  step={1}
  title="What Are We Doing?"
  subtitle="Pick a category to see suggestions"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  {animatingButton}
  animationType={animatingType}
  hints={[
    { key: 'A/B/X/Y', label: 'Select' },
    { key: 'D-PAD', label: 'Navigate' },
    { key: 'R4', label: 'Run App' },
    { key: 'RB', label: 'Screenshot' },
    { key: 'START', label: 'Menu' },
  ]}
/>
