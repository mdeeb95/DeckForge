<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import OnScreenKeyboard from '../components/OnScreenKeyboard.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { globalConfig, updateGlobalConfig } from '../stores/configStores';

  let keyboardOpen = $state(false);

  onMount(() => {
    entries.clear();
    status.set('idle');
    logCurrentState();
  });

  function logCurrentState() {
    const config = get(globalConfig);
    if (!config) return;
    const now = new Date().toTimeString().slice(0, 8);
    entries.addEntry({ type: 'prompt', label: 'PREDICTION ENGINE', body: 'Configure how suggestions are generated' });
    entries.addEntry({ type: 'timestamp', time: now, message: `Mode: <span class="text-primary">${config.prediction_engine.backend_mode}</span>` });
    entries.addEntry({ type: 'timestamp', time: now, message: `API Key: ${config.prediction_engine.direct_api_key_ref ? 'configured' : '<span class="text-slate-500">not set</span>'}` });
    const model = config.prediction_engine.model_overrides.level_2 || 'default';
    entries.addEntry({ type: 'timestamp', time: now, message: `Model: ${model}` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Temperature: ${config.prediction_engine.temperature}` });
    entries.addEntry({ type: 'cursor', message: 'Press A/B/X/Y to configure, DPAD L/R to adjust values' });
  }

  function toggleBackendMode() {
    const current = get(globalConfig);
    if (!current) return;
    const newMode = current.prediction_engine.backend_mode === 'proxied' ? 'direct' : 'proxied';

    updateGlobalConfig(cfg => ({
      ...cfg,
      prediction_engine: { ...cfg.prediction_engine, backend_mode: newMode },
    }));

    entries.addEntry({ type: 'thought', label: 'UPDATED', body: `Backend mode → <span class="text-primary">${newMode}</span>` });

    if (newMode === 'direct' && !current.prediction_engine.direct_api_key_ref) {
      entries.addEntry({ type: 'thought', label: 'WARNING', body: 'Direct mode requires an API key. Press B to enter one.' });
    }
  }

  function openKeyEntry() {
    keyboardOpen = true;
  }

  function handleKeyConfirm(value: string) {
    keyboardOpen = false;
    if (!value || value.length < 10) {
      entries.addEntry({ type: 'thought', label: 'ERROR', body: 'API key too short (min 10 chars)' });
      return;
    }
    updateGlobalConfig(cfg => ({
      ...cfg,
      prediction_engine: { ...cfg.prediction_engine, direct_api_key_ref: value },
    }));
    entries.addEntry({ type: 'thought', label: 'SAVED', body: `API key stored (${value.slice(0, 10)}...)` });
  }

  function handleKeyCancel() {
    keyboardOpen = false;
  }

  const availableModels = ['default', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-5-20251101'];
  let modelIndex = $state(0);

  function cycleModel(direction: 'left' | 'right') {
    modelIndex = direction === 'right'
      ? (modelIndex + 1) % availableModels.length
      : (modelIndex - 1 + availableModels.length) % availableModels.length;

    const model = availableModels[modelIndex] === 'default' ? null : availableModels[modelIndex];
    updateGlobalConfig(cfg => ({
      ...cfg,
      prediction_engine: {
        ...cfg.prediction_engine,
        model_overrides: { ...cfg.prediction_engine.model_overrides, level_2: model },
      },
    }));
    entries.addEntry({ type: 'thought', label: 'MODEL', body: `→ ${availableModels[modelIndex]}` });
  }

  function adjustTemperature(direction: 'left' | 'right') {
    const delta = direction === 'right' ? 0.1 : -0.1;
    updateGlobalConfig(cfg => {
      const newTemp = Math.max(0, Math.min(2, +(cfg.prediction_engine.temperature + delta).toFixed(1)));
      entries.addEntry({ type: 'thought', label: 'TEMP', body: `→ ${newTemp}` });
      return {
        ...cfg,
        prediction_engine: { ...cfg.prediction_engine, temperature: newTemp },
      };
    });
  }

  // Expose DPAD L/R cycling functions for input router via screenCards onclick
  const config = get(globalConfig);
  const currentModel = config?.prediction_engine.model_overrides.level_2 || 'default';

  const cards = [
    {
      button: 'A',
      title: 'Backend Mode',
      description: config?.prediction_engine.backend_mode === 'proxied' ? 'proxied via Railway' : 'direct Anthropic API',
      pills: [{ label: config?.prediction_engine.backend_mode ?? 'proxied', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: toggleBackendMode,
    },
    {
      button: 'B',
      title: 'API Key',
      description: config?.prediction_engine.direct_api_key_ref ? 'configured' : 'not set — required for direct mode',
      pills: [{ label: config?.prediction_engine.direct_api_key_ref ? 'configured' : 'not set', variant: (config?.prediction_engine.direct_api_key_ref ? 'active' : 'neutral') as 'active' | 'neutral' }],
      variant: 'secondary_pink' as const,
      onclick: openKeyEntry,
    },
    {
      button: 'X',
      title: 'Model Override',
      description: 'DPAD L/R to cycle models',
      pills: [{ label: currentModel === 'default' ? 'default' : currentModel.split('-').slice(0, 2).join('-'), variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => cycleModel('right'),
    },
    {
      button: 'Y',
      title: 'Temperature',
      description: 'DPAD L/R to adjust (0.0 – 2.0)',
      pills: [{ label: `${config?.prediction_engine.temperature ?? 0.8}`, variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => adjustTemperature('right'),
    },
  ];

  const secondaryCards = [
    { button: 'LB', label: 'Back to Settings', icon: 'arrow_back' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
</script>

{#if keyboardOpen}
  <OnScreenKeyboard
    label="Enter Anthropic API Key"
    placeholder="sk-ant-api03-..."
    masked={true}
    maskAfter={12}
    onConfirm={handleKeyConfirm}
    onCancel={handleKeyCancel}
  />
{/if}

<TerminalPanel />
<ActionPalette
  breadcrumb="Settings / Prediction"
  step={0}
  title="Prediction Engine"
  subtitle="How suggestions are generated"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  hints={[
    { key: 'A', label: 'Toggle Mode' },
    { key: 'B', label: 'API Key' },
    { key: 'D-PAD L/R', label: 'Adjust' },
    { key: 'LB', label: 'Back' },
  ]}
/>
