<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, screenCards } from '../stores/app';
  import { entries, status } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { globalConfig, updateGlobalConfig } from '../stores/configStores';
  import { createDefaultGlobalConfig } from '../data/defaults';
  import { saveGlobalConfig } from '../data/config';

  const PERMISSION_MODES = ['acceptEdits', 'plan', 'full', 'bypassPermissions'];
  let permissionIndex = $state(0);
  let confirmReset = $state(false);

  onMount(() => {
    entries.clear();
    status.set('idle');

    const config = get(globalConfig);
    if (!config) return;

    // Find current permission mode index
    const idx = PERMISSION_MODES.indexOf(config.claude_code.permission_mode);
    if (idx >= 0) permissionIndex = idx;

    const now = new Date().toTimeString().slice(0, 8);
    entries.addEntry({ type: 'prompt', label: 'ADVANCED', body: 'System configuration and debug tools' });
    entries.addEntry({ type: 'timestamp', time: now, message: `Permission Mode: <span class="text-primary">${config.claude_code.permission_mode}</span>` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Config: ~/.config/deckforge/global.json` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Version: v0.1.0 | Tauri 2 | Svelte 5` });
    entries.addEntry({ type: 'cursor', message: 'Use with care — Y resets everything' });
  });

  function cyclePermissionMode(direction: 'left' | 'right') {
    permissionIndex = direction === 'right'
      ? (permissionIndex + 1) % PERMISSION_MODES.length
      : (permissionIndex - 1 + PERMISSION_MODES.length) % PERMISSION_MODES.length;

    const mode = PERMISSION_MODES[permissionIndex];
    updateGlobalConfig(cfg => ({
      ...cfg,
      claude_code: { ...cfg.claude_code, permission_mode: mode },
    }));
    entries.addEntry({ type: 'thought', label: 'PERMISSION', body: `→ ${mode}` });
  }

  function showConfig() {
    const config = get(globalConfig);
    entries.addEntry({ type: 'code', content: JSON.stringify(config, null, 2), filePath: 'global.json' });
  }

  function showSystemInfo() {
    entries.addEntry({ type: 'thought', label: 'SYSTEM', body: [
      `DeckForge v0.1.0`,
      `Platform: ${navigator.platform}`,
      `User Agent: ${navigator.userAgent.slice(0, 80)}...`,
      `Screen: ${window.innerWidth}x${window.innerHeight}`,
      `Tauri: ${'__TAURI_INTERNALS__' in window ? 'yes' : 'no (dev mode)'}`,
    ].join('<br/>') });
  }

  async function handleReset() {
    if (!confirmReset) {
      confirmReset = true;
      entries.addEntry({ type: 'thought', label: 'WARNING', body: 'Press Y again to confirm reset. All settings will return to defaults.' });
      setTimeout(() => { confirmReset = false; }, 3000);
      return;
    }
    const newConfig = await createDefaultGlobalConfig();
    globalConfig.set(newConfig);
    await saveGlobalConfig(newConfig);
    entries.addEntry({ type: 'thought', label: 'RESET', body: 'All settings restored to defaults.' });
    confirmReset = false;
  }

  const config = get(globalConfig);

  const cards = [
    {
      title: 'Permission Mode',
      description: 'DPAD L/R to cycle Claude Code permissions',
      pills: [{ label: config?.claude_code.permission_mode ?? 'acceptEdits', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => cyclePermissionMode('right'),
    },
    {
      title: 'View Config',
      description: 'dump current global config to terminal',
      pills: [{ label: 'global.json', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: showConfig,
    },
    {
      title: 'System Info',
      description: 'version, platform, Tauri status',
      pills: [{ label: 'v0.1.0', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: showSystemInfo,
    },
    {
      title: 'Reset to Defaults',
      description: 'double-press to confirm — this is destructive',
      pills: [{ label: 'DESTRUCTIVE', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: handleReset,
    },
  ];

  const secondaryCards = [
    { button: 'LB', label: 'Back to Settings', icon: 'arrow_back' },
  ];

  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Settings / Advanced"
  step={0}
  title="Advanced"
  subtitle="Debug tools and dangerous buttons"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  hints={[
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'D-PAD', label: 'Navigate' },
  ]}
/>
