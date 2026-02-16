<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import { projectConfig, updateProjectConfig } from '../stores/configStores';
  import { currentPlan } from '../stores/prediction';
  import { runTests, type TestRunResult } from '../qa/qaRunner';
  import { analyzeTestResults } from '../qa/qaAnalyzer';
  import { commitAll, revertAll, getWorkingDiff, getChangedFileCount } from '../deploy/git';

  let testResult = $state<TestRunResult | null>(null);
  let fileCount = $state(0);
  let testPill = $state('0 tests');

  function getCwd(): string {
    return get(projectConfig)?.project.path ?? '.';
  }

  function getCommitMessage(): string {
    const plan = get(currentPlan);
    if (plan?.summary) {
      return `[DeckForge] ${plan.summary}`;
    }
    return '[DeckForge] Auto-commit from QA approval';
  }

  async function loadQA() {
    const config = get(projectConfig);
    if (!config) return;

    entries.clear();
    status.set('streaming');
    cost.set('$0.00');

    // Show execution header
    entries.addEntry({ type: 'prompt', label: 'QA REVIEW', body: '' });

    // Get changed file count
    const cwd = getCwd();
    fileCount = await getChangedFileCount(cwd);
    scope.set(`${fileCount} File${fileCount !== 1 ? 's' : ''} Changed`);

    // Run tests with streaming output
    entries.addEntry({ type: 'timestamp', time: '→', message: 'Running tests...' });

    const result = await runTests(config, (line) => {
      entries.addEntry({ type: 'timestamp', time: '', message: line });
    });

    testResult = result;
    testPill = `${result.total} tests`;

    // Show test results summary
    entries.addEntry({ type: 'prompt', label: 'TEST RESULTS', body: '' });

    if (result.tests.length > 0) {
      for (const t of result.tests) {
        const icon = t.passed
          ? '<span class="text-emerald-400">✓</span>'
          : '<span class="text-red-400">✗</span>';
        const duration = t.duration_ms > 0 ? ` <span class="text-slate-500">(${t.duration_ms}ms)</span>` : '';
        entries.addEntry({
          type: 'timestamp',
          time: t.passed ? '✓' : '✗',
          message: `${icon} ${t.name}${duration}`,
        });
      }
    }

    // Summary line
    const passRate = result.total > 0 ? Math.round((result.passed / result.total) * 100) : 100;
    const summaryColor = passRate >= 100 ? 'text-emerald-400' : passRate >= 70 ? 'text-amber-400' : 'text-red-400';
    entries.addEntry({
      type: 'thought',
      label: 'SUMMARY',
      body: `<span class="${summaryColor} font-bold">${result.passed} passed</span> · ${result.failed} failed · ${result.skipped} skipped · ${result.total} total`,
    });

    // Run analysis
    const analysis = await analyzeTestResults(
      result,
      config.project.name,
      config.tech_stack.framework,
    );

    entries.addEntry({
      type: 'thought',
      label: 'ASSESSMENT',
      body: analysis.assessment,
    });

    if (analysis.risk_areas.length > 0) {
      entries.addEntry({ type: 'prompt', label: 'RISK AREAS', body: '' });
      for (const risk of analysis.risk_areas) {
        entries.addEntry({ type: 'timestamp', time: '⚠', message: risk });
      }
    }

    if (analysis.suggested_fixes.length > 0) {
      entries.addEntry({ type: 'prompt', label: 'SUGGESTED FIXES', body: '' });
      for (const fix of analysis.suggested_fixes) {
        entries.addEntry({
          type: 'timestamp',
          time: '→',
          message: `<span class="text-amber-400">${fix.test_name}</span>: ${fix.suggestion}`,
        });
      }
    }

    // Progress bar via code entry
    const barFilled = Math.round(passRate / 5);
    const barEmpty = 20 - barFilled;
    const barColor = passRate >= 100 ? '█' : passRate >= 70 ? '█' : '█';
    entries.addEntry({
      type: 'code',
      filePath: 'pass rate',
      diff: false,
      content: `[${barColor.repeat(barFilled)}${'░'.repeat(barEmpty)}] ${passRate}% (${result.passed}/${result.total})`,
    });

    entries.addEntry({ type: 'cursor', message: 'QA review complete. Awaiting decision...' });

    status.set(result.failed > 0 ? 'error' : 'complete');
    cost.set(`${(result.duration_ms / 1000).toFixed(1)}s`);
  }

  // ─── Card onclick handlers ──────────────────────────────────────────────

  function handleApproveAndCommit() {
    const cwd = getCwd();
    const message = getCommitMessage();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'COMMITTING', body: '' });
    entries.addEntry({ type: 'timestamp', time: '→', message: `git add -A && git commit -m "${message}"` });

    commitAll(message, cwd).then((result) => {
      if (result.success) {
        entries.addEntry({
          type: 'thought',
          label: 'COMMIT SUCCESS',
          body: result.message,
        });

        // Update project config task count
        updateProjectConfig(c => ({
          ...c,
          claude_code: {
            ...c.claude_code,
            total_tasks_completed: c.claude_code.total_tasks_completed + 1,
            current_task_in_progress: false,
          },
        }));

        status.set('complete');

        // Check if deploy is configured — offer transition
        const config = get(projectConfig);
        if (config?.deploy.provider) {
          entries.addEntry({
            type: 'cursor',
            message: 'Commit created. Deploy configured — press A to deploy, or START to go home.',
          });
          // Update cards to offer deploy
          screenCards.set([
            { button: 'A', title: 'Go to Deploy', description: 'Deploy the committed changes', onclick: () => navigate('deploy_mode') },
            { button: 'B', title: 'Back to Home', description: 'Return to main screen', onclick: () => navigate('level1') },
          ]);
        } else {
          entries.addEntry({ type: 'cursor', message: 'Commit created. Press START to return home.' });
        }
      } else {
        entries.addEntry({
          type: 'thought',
          label: 'COMMIT FAILED',
          body: result.message,
        });
        entries.addEntry({ type: 'cursor', message: 'Commit failed. Check output above.' });
        status.set('error');
      }
    });
  }

  function handleRejectChanges() {
    const cwd = getCwd();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'REVERTING', body: '' });
    entries.addEntry({ type: 'timestamp', time: '→', message: 'git checkout -- . && git clean -fd' });

    revertAll(cwd).then((result) => {
      if (result.success) {
        entries.addEntry({
          type: 'thought',
          label: 'REVERT SUCCESS',
          body: result.message,
        });
        entries.addEntry({ type: 'cursor', message: 'All changes reverted. Returning to home...' });
        status.set('complete');

        // Auto-navigate back after a brief pause
        setTimeout(() => navigate('level1'), 1500);
      } else {
        entries.addEntry({
          type: 'thought',
          label: 'REVERT FAILED',
          body: result.message,
        });
        entries.addEntry({ type: 'cursor', message: 'Revert failed. Check output above.' });
        status.set('error');
      }
    });
  }

  function handleRunTestsAgain() {
    loadQA();
  }

  function handleViewDiff() {
    const cwd = getCwd();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'DIFF', body: '' });

    getWorkingDiff(cwd).then((diff) => {
      status.set('complete');
      entries.addEntry({ type: 'code', filePath: 'working changes', diff: true, content: diff });
      entries.addEntry({ type: 'cursor', message: 'Diff loaded. Use D-pad to scroll.' });
    });
  }

  // ─── Cards ────────────────────────────────────────────────────────────────

  const cards = $derived([
    {
      button: 'A',
      title: 'Approve and Commit',
      description: 'Accept all changes and create a git commit.',
      pills: [{ label: `${fileCount} files`, variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: handleApproveAndCommit,
    },
    {
      button: 'B',
      title: 'Reject Changes',
      description: 'Revert all modifications. Nothing will be saved.',
      pills: [{ label: 'Undo all', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: handleRejectChanges,
    },
    {
      button: 'X',
      title: 'Run Tests Again',
      description: 'Re-execute the test suite to double check.',
      pills: [{ label: testPill, variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: handleRunTestsAgain,
    },
    {
      button: 'Y',
      title: 'View Full Diff',
      description: 'Open a detailed diff view of every changed file.',
      pills: [{ label: `${fileCount} files`, variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: handleViewDiff,
    },
  ]);

  const secondaryCards = [
    { button: 'RB', label: 'Request Changes', icon: 'edit_note' },
    { button: 'LB', label: 'Explain Changes', icon: 'question_answer' },
  ];

  onMount(() => {
    loadQA();
  });

  // Register screen cards with onclick handlers
  $effect(() => {
    screenCards.set(
      cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })),
    );
  });
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="QA"
  title="QA Review"
  subtitle="Verify the changes before committing"
  cards={cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
/>
