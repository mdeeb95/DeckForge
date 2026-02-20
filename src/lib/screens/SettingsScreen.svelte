<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards, previousScreen } from '../stores/app';
  import { entries, status } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { globalConfig } from '../stores/configStores';
  import { updateInfo, updateStatus } from '../stores/updater';
  import { checkForUpdate } from '../system/updateChecker';

  onMount(() => {
    entries.clear();
    status.set('idle');

    const config = get(globalConfig);
    if (!config) return;

    const now = new Date().toTimeString().slice(0, 8);
    entries.addEntry({ type: 'prompt', label: 'SETTINGS', body: 'DeckForge Configuration' });
    entries.addEntry({ type: 'timestamp', time: now, message: `Backend: ${config.prediction_engine.backend_mode}` });
    entries.addEntry({ type: 'timestamp', time: now, message: `API Key: ${config.prediction_engine.direct_api_key_ref ? 'configured' : 'not set'}` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Theme: ${config.display.theme}` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Split Ratio: ${config.display.default_split_ratio}%` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Telemetry: ${config.telemetry.enabled ? 'enabled' : 'disabled'}` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Budget Alert: $${config.cost_tracking.session_budget_warning_threshold_usd.toFixed(2)}` });
    entries.addEntry({ type: 'cursor', message: 'Select a category to configure' });
  });

  const config = get(globalConfig);

  const cards = [
    {
      title: 'Prediction Engine',
      description: 'backend mode, API key, models',
      pills: [{ label: config?.prediction_engine.backend_mode ?? 'proxied', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => navigate('settings_prediction'),
    },
    {
      title: 'Display & Input',
      description: 'split ratio, scanlines, scroll speed',
      pills: [{ label: `${config?.display.default_split_ratio ?? 55}%`, variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => navigate('settings_display'),
    },
    {
      title: 'Telemetry & Cost',
      description: 'usage data, cost alerts',
      pills: [{ label: config?.telemetry.enabled ? 'enabled' : 'disabled', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => navigate('settings_telemetry'),
    },
    {
      title: 'Advanced',
      description: 'reset, debug, system info',
      pills: [{ label: 'v0.1.0', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => navigate('settings_advanced'),
    },
  ];

  const secondaryCards = [
    { button: 'START', label: 'Close Settings', icon: 'arrow_back' },
    { button: 'LB', label: 'Back', icon: 'arrow_back' },
    { button: 'X', label: $updateStatus === 'available' ? `Update ${$updateInfo?.version}` : 'Check for Updates', icon: 'system_update', onclick: () => checkForUpdate() },
  ];

  screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Settings"
  step={0}
  title="Configuration"
  subtitle="Adjust DeckForge to your liking"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  hints={[
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'D-PAD', label: 'Navigate' },
  ]}
/>
