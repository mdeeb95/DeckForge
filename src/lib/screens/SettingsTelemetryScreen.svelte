<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, screenCards } from '../stores/app';
  import { settingsAdjustHandlers } from '../stores/app';
  import { entries, status } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { globalConfig, updateGlobalConfig } from '../stores/configStores';

  onMount(() => {
    entries.clear();
    status.set('idle');

    const config = get(globalConfig);
    if (!config) return;
    const now = new Date().toTimeString().slice(0, 8);
    entries.addEntry({ type: 'prompt', label: 'TELEMETRY & COST', body: 'Privacy and budget settings' });
    entries.addEntry({ type: 'timestamp', time: now, message: `Telemetry: <span class="text-primary">${config.telemetry.enabled ? 'enabled' : 'disabled'}</span>` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Cost Indicator: ${config.cost_tracking.show_cost_indicator ? 'shown' : 'hidden'}` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Budget Alert: $${config.cost_tracking.session_budget_warning_threshold_usd.toFixed(2)}` });
    entries.addEntry({ type: 'cursor', message: 'Toggle settings or adjust budget threshold' });
  });

  function toggleTelemetry() {
    updateGlobalConfig(cfg => {
      const newVal = !cfg.telemetry.enabled;
      entries.addEntry({ type: 'thought', label: 'TELEMETRY', body: `→ ${newVal ? 'enabled' : 'disabled'}` });
      return { ...cfg, telemetry: { ...cfg.telemetry, enabled: newVal } };
    });
  }

  function toggleCostIndicator() {
    updateGlobalConfig(cfg => {
      const newVal = !cfg.cost_tracking.show_cost_indicator;
      entries.addEntry({ type: 'thought', label: 'COST INDICATOR', body: `→ ${newVal ? 'shown' : 'hidden'}` });
      return { ...cfg, cost_tracking: { ...cfg.cost_tracking, show_cost_indicator: newVal } };
    });
  }

  function adjustBudget(direction: 'left' | 'right') {
    const delta = direction === 'right' ? 0.25 : -0.25;
    updateGlobalConfig(cfg => {
      const newVal = Math.max(0.25, +(cfg.cost_tracking.session_budget_warning_threshold_usd + delta).toFixed(2));
      entries.addEntry({ type: 'thought', label: 'BUDGET', body: `→ $${newVal.toFixed(2)}` });
      return { ...cfg, cost_tracking: { ...cfg.cost_tracking, session_budget_warning_threshold_usd: newVal } };
    });
  }

  // Reactive cards — recompute whenever globalConfig changes
  const cfg = $derived($globalConfig);

  const cards = $derived.by(() => {
    const c = cfg;
    if (!c) return [];
    return [
      {
        title: 'Telemetry',
        description: 'anonymous usage data',
        pills: [{ label: c.telemetry.enabled ? 'enabled' : 'disabled', variant: 'active' as const }],
        variant: 'primary' as const,
        onclick: toggleTelemetry,
      },
      {
        title: 'Cost Indicator',
        description: 'show session cost in terminal header',
        pills: [{ label: c.cost_tracking.show_cost_indicator ? 'shown' : 'hidden', variant: (c.cost_tracking.show_cost_indicator ? 'active' : 'neutral') as 'active' | 'neutral' }],
        variant: 'secondary_pink' as const,
        onclick: toggleCostIndicator,
      },
      {
        title: 'Budget Alert',
        description: 'A to increase, DPAD L/R to adjust threshold',
        pills: [{ label: `$${c.cost_tracking.session_budget_warning_threshold_usd.toFixed(2)}`, variant: 'neutral' as const }],
        variant: 'neutral' as const,
        onclick: () => adjustBudget('right'),
      },
    ];
  });

  // Keep screenCards in sync reactively
  $effect(() => {
    screenCards.set(cards.map(c => ({ title: c.title, description: c.description, onclick: c.onclick })));
  });

  // Register D-pad L/R adjust handlers
  $effect(() => {
    settingsAdjustHandlers.set({
      0: { left: toggleTelemetry, right: toggleTelemetry },
      1: { left: toggleCostIndicator, right: toggleCostIndicator },
      2: { left: () => adjustBudget('left'), right: () => adjustBudget('right') },
    });
    return () => settingsAdjustHandlers.set({});
  });

  const secondaryCards = [
    { button: 'LB', label: 'Back to Settings', icon: 'arrow_back' },
  ];
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Settings / Telemetry"
  step={0}
  title="Telemetry & Cost"
  subtitle="Privacy and budget controls"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  hints={[
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'D-PAD', label: 'Navigate' },
  ]}
/>
