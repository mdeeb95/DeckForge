<script lang="ts">
  import StatusBar from './lib/components/StatusBar.svelte';
  import TerminalPanel from './lib/components/TerminalPanel.svelte';
  import ActionPalette from './lib/components/ActionPalette.svelte';
  import BottomHUD from './lib/components/BottomHUD.svelte';
  import { projectName, connected } from './lib/stores/app';
  import { entries, status, cost } from './lib/stores/terminal';
  import type { TerminalEntry } from './lib/stores/terminal';

  // Sample entries matching the mockup
  const sampleEntries: TerminalEntry[] = [
    { type: 'timestamp', time: '14:20:01', message: 'DeckForge v0.1.0 initialized' },
    { type: 'timestamp', time: '14:20:01', message: 'Scanning project workspace...' },
    { type: 'timestamp', time: '14:20:02', message: 'Detected: <span class="text-slate-300">TypeScript + React + Vite</span>' },
    { type: 'timestamp', time: '14:20:02', message: 'Git status: on branch <span class="text-secondary">main</span> — clean' },
    { type: 'timestamp', time: '14:20:03', message: 'Claude Code SDK connected <span class="text-emerald-400">✓</span>' },
    { type: 'timestamp', time: '14:20:03', message: 'Prediction engine warming up...' },
    { type: 'prompt', label: 'SYSTEM', body: 'Ready. Select a category to begin. Predictions loaded for 4 categories.' },
    { type: 'thought', label: 'CONTEXT', body: 'Analyzing <span class="text-slate-300 bg-slate-800 px-1 rounded">neo-dashboard-v2</span> — 47 files, 12 open issues, last commit 2h ago. Generating suggestions across <span class="text-primary">Feature</span>, <span class="text-secondary">Bug</span>, <span class="text-slate-300">Tech Debt</span>, and <span class="text-amber-400">Yolo</span> categories.' },
    { type: 'code', filePath: 'project summary', diff: false, content: `Last session:  3 features shipped, 1 bug fixed\nOpen issues:   12 (4 bugs, 5 features, 3 tech debt)\nTest coverage: 74% (target: 80%)\nBundle size:   248kb (under budget)\nLast deploy:   2 hours ago ✓` },
    { type: 'cursor', message: 'Awaiting category selection...' },
  ];

  // Populate stores with sample data
  projectName.set('neo-dashboard-v2');
  connected.set(true);
  status.set('idle');
  cost.set('$0.00');
  sampleEntries.forEach(e => entries.addEntry(e));
</script>

<div class="h-screen w-screen flex flex-col overflow-hidden">
  <!-- Status Bar -->
  <StatusBar projectName={$projectName} connected={$connected} version="v0.1.0" />

  <!-- Main Workspace -->
  <main class="flex-1 flex overflow-hidden relative">
    <TerminalPanel />
    <ActionPalette />
    <BottomHUD />
  </main>
</div>
