<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, projectName, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { entries, status, cost } from '../stores/terminal';
  import { activeTab } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { loadPredictions } from '../stores/prediction';
  import type { Category } from '../prediction/types';
  import type { TerminalEntry } from '../stores/terminal';
  import { getRandomMessage } from '../personality/messages';
  import { appRunning, appPid, appError, appOutput } from '../stores/launcher';
  import { projectConfig } from '../stores/configStores';
  import { authToken } from '../stores/configStores';
  import { launchApp, restartApp, isRunning, getCurrentCommand, getCurrentCwd } from '../system/appLauncher';
  import { startAutoFix, buildAutoFixPrompt } from '../system/autoFix';
  import { killPort } from '../system/portKiller';
  import { getGitStatus } from '../deploy/git';
  import { claudeStatus } from '../system/claudeResolver';
  let abortController: AbortController;

  onMount(() => {
    abortController = new AbortController();
    entries.clear();

    const config = get(projectConfig);
    const auth = get(authToken);
    const name = get(projectName) || config?.project.name || 'project';
    const now = new Date().toTimeString().slice(0, 8);
    const splash = getRandomMessage('splash');
    const boot = getRandomMessage('boot');

    const bootEntries: TerminalEntry[] = [
      { type: 'timestamp', time: now, message: boot },
    ];

    // Tech stack — from real project config
    if (config) {
      const techParts = [config.tech_stack.language, config.tech_stack.framework, config.tech_stack.build_tool].filter(Boolean);
      if (techParts.length > 0) {
        bootEntries.push({ type: 'timestamp', time: now, message: `Detected: <span class="text-slate-300">${techParts.join(' + ')}</span>` });
      }
    }

    // Backend status — from real auth token
    if (auth) {
      bootEntries.push({ type: 'timestamp', time: now, message: 'Backend connected <span class="text-emerald-400">&#10003;</span>' });
    } else {
      bootEntries.push({ type: 'timestamp', time: now, message: 'Backend: <span class="text-slate-500">offline — mock mode</span>' });
    }

    // Claude CLI status
    const cliStatus = get(claudeStatus);
    if (cliStatus === 'not_found') {
      bootEntries.push({ type: 'timestamp', time: now, message: 'Claude CLI: <span class="text-red-400">not found</span> — install with <span class="text-slate-300">npm install -g @anthropic-ai/claude-code</span>' });
    } else if (cliStatus === 'found') {
      bootEntries.push({ type: 'timestamp', time: now, message: 'Claude CLI <span class="text-emerald-400">&#10003;</span>' });
    }

    bootEntries.push({ type: 'prompt', label: 'SYSTEM', body: splash });

    // Context — only real data from project config
    if (config) {
      const contextParts: string[] = [];
      const sessions = config.session_history.total_sessions;
      const tasks = config.claude_code.total_tasks_completed;
      const deps = config.tech_stack.dependencies.length;
      if (sessions > 0) contextParts.push(`${sessions} session${sessions !== 1 ? 's' : ''}`);
      if (tasks > 0) contextParts.push(`${tasks} task${tasks !== 1 ? 's' : ''} completed`);
      if (deps > 0) contextParts.push(`${deps} dependencies`);

      if (contextParts.length > 0) {
        bootEntries.push({ type: 'thought', label: 'CONTEXT', body: `<span class="text-slate-300 bg-slate-800 px-1 rounded">${name}</span> — ${contextParts.join(', ')}` });
      }
    }

    bootEntries.push({ type: 'cursor', message: 'Awaiting category selection...' });

    status.set('idle');
    cost.set('$0.00');
    bootEntries.forEach(e => entries.addEntry(e));

    // Git status — async, added when ready
    const cwd = config?.project.path || '.';
    getGitStatus(cwd).then(git => {
      if (abortController.signal.aborted) return;
      const statusText = git.files_changed > 0
        ? `${git.files_changed} file${git.files_changed !== 1 ? 's' : ''} changed`
        : 'clean';
      // Insert before cursor (replace the cursor, then re-add it)
      entries.addEntry({ type: 'timestamp', time: now, message: `Git: on <span class="text-secondary">${git.branch}</span> — ${statusText}` });
    });
  });

  onDestroy(() => {
    abortController.abort();
  });

  let animatingType = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
  let animatingIndex = $state<number | null>(null);

  function selectCategory(category: Category) {
    if (animatingType) return;

    // YOLO always gets glitch — design rule: Y is always ridiculous
    const isYolo = category === 'yolo';
    const anim = isYolo ? 'glitch' : 'confirm';
    const duration = isYolo ? 450 : 350;

    animatingType = anim;
    animatingIndex = get(selectedCardIndex);
    screenCards.set([]); // lock gamepad during animation

    // Start loading predictions before navigating (fires async, doesn't block)
    loadPredictions(category, abortController.signal);

    setTimeout(() => {
      animatingType = null;
      animatingIndex = null;
      navigate('level2');
    }, duration);
  }

  // Level 1 category cards — all 4 get branded colors per style guide section 13
  const cards = [
    {
      title: 'Feature',
      description: 'build something new',
      pills: [{ label: '8 suggestions', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => selectCategory('feature'),
    },
    {
      title: 'Bug',
      description: 'fix something broken',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => selectCategory('bug'),
    },
    {
      title: 'Tech Debt',
      description: 'pay down the mess',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => selectCategory('tech_debt'),
    },
    {
      title: 'Yolo',
      description: 'surprise me, I\'m feeling lucky',
      pills: [{ label: '8 suggestions', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => selectCategory('yolo'),
    },
  ];

  // ─── Error Recovery Cards ──────────────────────────────────────────────────

  const BLAME_QUIPS = [
    'Node.js started it. We all saw.',
    'Classic Node. Refuses to share ports like a toddler.',
    'In Node\'s defense... no, there is no defense.',
    'Node.js: because one event loop wasn\'t enough drama.',
  ];

  const SOLAR_QUIPS = [
    'Cosmic rays flipped a bit. Science confirms it.',
    'The sun literally sabotaged your app. Not your fault.',
    'Solar wind: the original force push.',
    'Even stars have bugs. Yours just happened to crash.',
  ];

  let portInUseCards = $derived($appError?.type === 'port_in_use' ? [
    {
      title: 'Kill Port & Restart',
      description: `nuke whatever\'s on port ${$appError.port ?? '???'} and relaunch`,
      pills: [{ label: 'auto-fix', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: async () => {
        const port = $appError?.port ?? get(projectConfig)?.run_config?.port;
        if (port) {
          const killed = await killPort(port);
          console.log(`[errorRecovery] killPort(${port}) → ${killed}`);
          // Give OS time to release the port
          await new Promise(r => setTimeout(r, 800));
        }
        appError.set(null);
        await restartApp();
      },
    },
    {
      title: 'Dismiss',
      description: 'clear the error and carry on',
      pills: [] as { label: string; variant: 'active' | 'neutral' }[],
      variant: 'neutral' as const,
      onclick: () => { appError.set(null); },
    },
    {
      title: 'File as Bug',
      description: 'route this to bug category with context',
      pills: [{ label: 'bug report', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => {
        appError.set(null);
        loadPredictions('bug', abortController.signal);
        navigate('level2');
      },
    },
    {
      title: 'Blame Node.js',
      description: 'it was definitely Node\'s fault',
      pills: [{ label: 'obviously', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => {
        const quip = BLAME_QUIPS[Math.floor(Math.random() * BLAME_QUIPS.length)];
        appOutput.update(lines => [...lines, `[deckforge] ${quip}`]);
        appError.set(null);
      },
    },
  ] : null);

  let genericCrashCards = $derived($appError?.type === 'generic_crash' ? [
    {
      title: 'Auto Fix',
      description: 'let Claude diagnose and fix the crash',
      pills: [{ label: 'auto-fix', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => {
        const error = $appError!;
        startAutoFix(error);
        const prompt = buildAutoFixPrompt(error, getCurrentCommand(), getCurrentCwd(), 1, [error]);
        pendingClaudePrompt.set(prompt);
        appError.set(null);
        navigate('ai_working');
      },
    },
    {
      title: 'Restart App',
      description: 'try running it again',
      pills: [{ label: 'relaunch', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: async () => {
        appError.set(null);
        await restartApp();
      },
    },
    {
      title: 'File as Bug',
      description: 'create a bug report with crash context',
      pills: [{ label: 'bug report', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => {
        appError.set(null);
        loadPredictions('bug', abortController.signal);
        navigate('level2');
      },
    },
    {
      title: 'Blame Solar Flares',
      description: 'the cosmos did this, not your code',
      pills: [{ label: 'obviously', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => {
        const quip = SOLAR_QUIPS[Math.floor(Math.random() * SOLAR_QUIPS.length)];
        appOutput.update(lines => [...lines, `[deckforge] ${quip}`]);
        appError.set(null);
      },
    },
  ] : null);

  let activeCards = $derived(portInUseCards ?? genericCrashCards ?? cards);
  let isErrorMode = $derived(!!$appError);

  // ─── Reactive screenCards sync ─────────────────────────────────────────────

  $effect(() => {
    const current = activeCards;
    screenCards.set(current.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
  });

  // Auto-switch to app tab on error
  $effect(() => {
    if ($appError) {
      activeTab.set('app');
      selectedCardIndex.set(0);
    }
  });

  // ─── Normal UI ─────────────────────────────────────────────────────────────

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

  let secondaryCards = $derived(isErrorMode ? [] : [
    { button: 'SELECT', label: 'QA Mode', icon: 'checklist' },
    { button: 'R4', label: $appRunning ? `App Running (PID ${$appPid})` : 'Run App', icon: $appRunning ? 'stop_circle' : 'play_arrow', variant: 'emerald' as const },
    { button: 'X', label: 'History', icon: 'history' },
  ]);

  // Error mode palette props
  let errorTitle = $derived(
    $appError?.type === 'port_in_use' ? 'Port Conflict' : 'App Crashed'
  );
  let errorSubtitle = $derived($appError?.summary ?? 'Something went wrong');

  let hints = $derived(isErrorMode
    ? [
        { key: 'A', label: 'Select' },
        { key: 'D-PAD', label: 'Navigate' },
      ]
    : [
        { key: 'A', label: 'Select' },
        { key: 'D-PAD', label: 'Navigate' },
        { key: 'R4', label: 'Run App' },
        { key: 'RB', label: 'Screenshot' },
        { key: 'START', label: 'Menu' },
      ]
  );
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb={isErrorMode ? 'Error Recovery' : 'Category Select'}
  step={isErrorMode ? 0 : 1}
  title={isErrorMode ? errorTitle : 'What Are We Doing?'}
  subtitle={isErrorMode ? errorSubtitle : 'Pick a category to see suggestions'}
  cards={activeCards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  {animatingIndex}
  animationType={animatingType}
  {hints}
/>
