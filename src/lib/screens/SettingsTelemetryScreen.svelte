<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, screenCards } from '../stores/app';
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

  const config = get(globalConfig);

  const cards = [
    {
      button: 'A',
      title: 'Telemetry',
      description: 'anonymous usage data',
      pills: [{ label: config?.telemetry.enabled ? 'enabled' : 'disabled', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: toggleTelemetry,
    },
    {
      button: 'B',
      title: 'Cost Indicator',
      description: 'show session cost in terminal header',
      pills: [{ label: config?.cost_tracking.show_cost_indicator ? 'shown' : 'hidden', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: toggleCostIndicator,
    },
    {
      button: 'X',
      title: 'Budget Alert',
      description: 'DPAD L/R to adjust threshold',
      pills: [{ label: `$${config?.cost_tracking.session_budget_warning_threshold_usd.toFixed(2) ?? '0.50'}`, variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => adjustBudget('right'),
    },
  ];

  const secondaryCards = [
    { button: 'LB', label: 'Back to Settings', icon: 'arrow_back' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
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
    { key: 'A/B', label: 'Toggle' },
    { key: 'D-PAD L/R', label: 'Adjust' },
    { key: 'LB', label: 'Back' },
  ]}
/>
