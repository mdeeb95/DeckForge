<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import { projectConfig, updateProjectConfig } from '../stores/configStores';
  import type { DeployProvider } from '../types/data';
  import { getGitStatus, getUnpushedCommits, getDiff, getInsertionsDeletions } from '../deploy/git';
  import { detectDeployConfig, runPreflightChecks, pushAndDeploy, previewDeploy, pushOnly } from '../deploy/deployer';
  import type { DeploySection } from '../deploy/deployer';

  const PROVIDER_CYCLE: DeployProvider[] = ['vercel', 'railway', 'netlify', 'github_pages', null];

  let diffPill = $state('+0 -0');

  function getDeploySection(): DeploySection {
    const config = get(projectConfig);
    return {
      provider: config?.deploy.provider ?? null,
      branch_strategy: config?.deploy.branch_strategy ?? 'direct_push',
      target_branch: config?.deploy.target_branch ?? 'main',
    };
  }

  function getCwd(): string {
    return get(projectConfig)?.project.path ?? '.';
  }

  async function loadTerminal() {
    const config = get(projectConfig);
    const cwd = getCwd();

    entries.clear();
    status.set('idle');
    cost.set('$0.00');

    // Auto-detect deploy provider if not set
    if (config && config.deploy.provider === null) {
      const detected = await detectDeployConfig(cwd);
      if (detected.provider) {
        await updateProjectConfig(c => ({
          ...c,
          deploy: {
            ...c.deploy,
            provider: detected.provider,
            auto_detected: true,
            detection_source: detected.source,
          },
        }));
      }
    }

    // Git status
    const gitStatus = await getGitStatus(cwd);
    entries.addEntry({
      type: 'thought',
      label: 'GIT STATUS',
      body: `Branch ${gitStatus.branch} is ${gitStatus.commits_ahead} commit${gitStatus.commits_ahead !== 1 ? 's' : ''} ahead of origin.${gitStatus.has_conflicts ? ' ⚠ Merge conflicts detected!' : ''}`,
    });

    // Unpushed commits
    const commits = await getUnpushedCommits(cwd);
    if (commits.length > 0) {
      entries.addEntry({ type: 'prompt', label: 'RECENT COMMITS (UNPUSHED)', body: '' });
      for (const c of commits) {
        entries.addEntry({
          type: 'timestamp',
          time: c.sha,
          message: `${c.message} <span class="text-slate-500">· ${c.timestamp} · ${c.files_changed} file${c.files_changed !== 1 ? 's' : ''} · +${c.insertions} -${c.deletions}</span>`,
        });
      }
    }

    // Preflight checks
    const checks = await runPreflightChecks(cwd);
    entries.addEntry({ type: 'prompt', label: 'PRE-FLIGHT CHECKS', body: '' });
    for (const check of checks) {
      entries.addEntry({
        type: 'timestamp',
        time: check.passed ? '✓' : '✗',
        message: check.detail,
      });
    }

    // Deploy config summary
    const updatedConfig = get(projectConfig);
    const provider = updatedConfig?.deploy.provider ?? 'none';
    const branch = gitStatus.branch;
    const target = updatedConfig?.deploy.target_branch ?? 'main';
    const strategy = updatedConfig?.deploy.branch_strategy ?? 'direct_push';
    const lastDeploy = updatedConfig?.deploy.last_deploy;
    const lastDeployStr = lastDeploy ? `${lastDeploy.status} (${lastDeploy.deployed_at})` : 'never';

    entries.addEntry({
      type: 'code',
      filePath: 'deploy config',
      diff: false,
      content: `Target:    ${provider} (production)
Domain:    ${updatedConfig?.deploy.domain ?? 'auto'}
Branch:    ${branch} → ${target}
Strategy:  ${strategy.replace(/_/g, ' ')}
Last deploy: ${lastDeployStr}`,
    });

    entries.addEntry({ type: 'cursor', message: 'Ready to deploy. Awaiting confirmation...' });

    // Update scope with file count
    scope.set(`${gitStatus.files_changed} File${gitStatus.files_changed !== 1 ? 's' : ''}`);

    // Load insertion/deletion pill
    const stats = await getInsertionsDeletions(cwd);
    diffPill = `+${stats.insertions} -${stats.deletions}`;
  }

  // ─── Card onclick handlers ──────────────────────────────────────────────

  function handlePushAndDeploy() {
    const cwd = getCwd();
    const section = getDeploySection();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'DEPLOYING', body: '' });

    pushAndDeploy(section, cwd, (line) => {
      entries.addEntry({ type: 'timestamp', time: '→', message: line });
    }).then((result) => {
      status.set(result.success ? 'complete' : 'error');
      entries.addEntry({
        type: 'thought',
        label: result.success ? 'DEPLOY SUCCESS' : 'DEPLOY FAILED',
        body: result.message + (result.url ? ` — ${result.url}` : ''),
      });
      entries.addEntry({ type: 'cursor', message: result.success ? 'Deploy complete.' : 'Deploy failed. Check output above.' });

      if (result.success) {
        updateProjectConfig(c => ({
          ...c,
          deploy: {
            ...c.deploy,
            last_deploy: {
              status: 'healthy',
              url: result.url,
              preview_url: result.preview_url,
              deployed_at: new Date().toISOString(),
              commit_sha: '',
              duration_seconds: result.duration_seconds,
            },
          },
        }));
      }
    });
  }

  function handlePreviewDeploy() {
    const cwd = getCwd();
    const section = getDeploySection();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'PREVIEW DEPLOY', body: '' });

    previewDeploy(section, cwd, (line) => {
      entries.addEntry({ type: 'timestamp', time: '→', message: line });
    }).then((result) => {
      status.set(result.success ? 'complete' : 'error');
      entries.addEntry({
        type: 'thought',
        label: result.success ? 'PREVIEW READY' : 'PREVIEW FAILED',
        body: result.message + (result.preview_url ? ` — ${result.preview_url}` : ''),
      });
      entries.addEntry({ type: 'cursor', message: result.success ? 'Preview deployed.' : 'Preview deploy failed.' });
    });
  }

  function handlePushOnly() {
    const cwd = getCwd();
    const section = getDeploySection();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'PUSHING', body: '' });

    pushOnly(section, cwd, (line) => {
      entries.addEntry({ type: 'timestamp', time: '→', message: line });
    }).then((result) => {
      status.set(result.success ? 'complete' : 'error');
      entries.addEntry({
        type: 'thought',
        label: result.success ? 'PUSH COMPLETE' : 'PUSH FAILED',
        body: result.message,
      });
      entries.addEntry({ type: 'cursor', message: result.success ? 'Push complete.' : 'Push failed.' });
    });
  }

  function handleReviewChanges() {
    const cwd = getCwd();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'DIFF', body: '' });

    getDiff(cwd).then((diff) => {
      status.set('complete');
      entries.addEntry({ type: 'code', filePath: 'unpushed changes', diff: true, content: diff });
      entries.addEntry({ type: 'cursor', message: 'Diff loaded. Use D-pad to scroll.' });
    });
  }

  function handleChangeTarget() {
    const config = get(projectConfig);
    if (!config) return;

    const currentProvider = config.deploy.provider;
    const currentIndex = PROVIDER_CYCLE.indexOf(currentProvider);
    const nextIndex = (currentIndex + 1) % PROVIDER_CYCLE.length;
    const nextProvider = PROVIDER_CYCLE[nextIndex];

    updateProjectConfig(c => ({
      ...c,
      deploy: {
        ...c.deploy,
        provider: nextProvider,
        auto_detected: false,
        detection_source: 'manual',
      },
    }));

    // Refresh terminal with new config
    loadTerminal();
  }

  function handleDeployHistory() {
    const config = get(projectConfig);
    const lastDeploy = config?.deploy.last_deploy;

    entries.clear();
    status.set('idle');

    if (lastDeploy) {
      entries.addEntry({ type: 'prompt', label: 'LAST DEPLOY', body: '' });
      entries.addEntry({
        type: 'code',
        filePath: 'deploy history',
        diff: false,
        content: `Status:    ${lastDeploy.status}
URL:       ${lastDeploy.url || 'N/A'}
Preview:   ${lastDeploy.preview_url || 'N/A'}
Deployed:  ${lastDeploy.deployed_at}
Commit:    ${lastDeploy.commit_sha || 'N/A'}
Duration:  ${lastDeploy.duration_seconds}s`,
      });
    } else {
      entries.addEntry({ type: 'thought', label: 'DEPLOY HISTORY', body: 'No previous deploys recorded.' });
    }
    entries.addEntry({ type: 'cursor', message: 'Press LB again to refresh, or use other buttons to deploy.' });
  }

  // ─── Cards ────────────────────────────────────────────────────────────────

  const cards = $derived([
    {
      button: 'A',
      title: 'Push and Deploy',
      description: 'Merge to main, push to origin, and trigger production deploy.',
      pills: [{ label: 'Production', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: handlePushAndDeploy,
    },
    {
      button: 'B',
      title: 'Preview Deploy',
      description: 'Push branch and deploy to a temporary preview URL. No merge.',
      pills: [{ label: 'Staging', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: handlePreviewDeploy,
    },
    {
      button: 'X',
      title: 'Push Only',
      description: 'Push branch to origin without merging or deploying. Opens a PR.',
      pills: [{ label: 'Git only', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: handlePushOnly,
    },
    {
      button: 'Y',
      title: 'Review Changes',
      description: 'View the full diff of all commits before deciding.',
      pills: [{ label: diffPill, variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: handleReviewChanges,
    },
  ]);

  const secondaryCards = [
    { button: 'RB', label: 'Change Deploy Target', icon: 'swap_horiz' },
    { button: 'LB', label: 'Deploy History', icon: 'history' },
  ];

  onMount(() => {
    loadTerminal();
  });

  // Register screen cards with onclick handlers (including secondary buttons)
  $effect(() => {
    screenCards.set([
      ...cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })),
      { button: 'RB', title: 'Change Deploy Target', description: '', onclick: handleChangeTarget },
      { button: 'LB', title: 'Deploy History', description: '', onclick: handleDeployHistory },
    ]);
  });
</script>

<TerminalPanel />
<ActionPalette
  title="Deploy"
  subtitle="Push to remote and trigger deployment"
  cards={cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
/>
