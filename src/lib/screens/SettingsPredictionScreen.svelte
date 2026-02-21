<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { settingsAdjustHandlers } from '../stores/app';
  import { entries, status } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { globalConfig, updateGlobalConfig } from '../stores/configStores';

  let editingApiKey = $state(false);
  let apiKeyInput = $state('');

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
      entries.addEntry({ type: 'thought', label: 'WARNING', body: 'Direct mode requires an API key. Navigate to the API Key card and press A.' });
    }
  }

  function openKeyEntry() {
    const current = $globalConfig?.prediction_engine.direct_api_key_ref || '';
    apiKeyInput = current;
    editingApiKey = true;
    tick().then(() => {
      const input = document.getElementById('api-key-input');
      if (input) input.focus();
    });
  }

  function saveApiKey() {
    if (apiKeyInput.length < 10) {
      entries.addEntry({ type: 'thought', label: 'ERROR', body: 'API key too short (min 10 chars)' });
      return;
    }
    updateGlobalConfig(cfg => ({
      ...cfg,
      prediction_engine: { ...cfg.prediction_engine, direct_api_key_ref: apiKeyInput },
    }));
    entries.addEntry({ type: 'thought', label: 'SAVED', body: `API key stored (${apiKeyInput.slice(0, 10)}...)` });
    editingApiKey = false;
  }

  function cancelKeyEntry() {
    editingApiKey = false;
  }

  function handleKeyInputKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      saveApiKey();
    } else if (e.key === 'Escape') {
      cancelKeyEntry();
    }
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

  // Reactive cards — recompute whenever globalConfig changes
  const cfg = $derived($globalConfig);

  const cards = $derived.by(() => {
    const c = cfg;
    if (!c) return [];
    const model = c.prediction_engine.model_overrides.level_2 || 'default';
    const modelLabel = model === 'default' ? 'default' : model.split('-').slice(0, 2).join('-');
    return [
      {
        title: 'Backend Mode',
        description: c.prediction_engine.backend_mode === 'proxied' ? 'proxied via Railway' : 'direct Anthropic API',
        pills: [{ label: c.prediction_engine.backend_mode, variant: 'active' as const }],
        variant: 'primary' as const,
        onclick: toggleBackendMode,
      },
      {
        title: 'API Key',
        description: c.prediction_engine.direct_api_key_ref ? 'configured' : 'not set — required for direct mode',
        pills: [{ label: c.prediction_engine.direct_api_key_ref ? 'configured' : 'not set', variant: (c.prediction_engine.direct_api_key_ref ? 'active' : 'neutral') as 'active' | 'neutral' }],
        variant: 'secondary_pink' as const,
        onclick: openKeyEntry,
      },
      {
        title: 'Model Override',
        description: 'A to cycle, DPAD L/R to adjust',
        pills: [{ label: modelLabel, variant: 'neutral' as const }],
        variant: 'neutral' as const,
        onclick: () => cycleModel('right'),
      },
      {
        title: 'Temperature',
        description: 'A to increase, DPAD L/R to adjust (0.0 – 2.0)',
        pills: [{ label: `${c.prediction_engine.temperature}`, variant: 'neutral' as const }],
        variant: 'amber' as const,
        onclick: () => adjustTemperature('right'),
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
      0: { left: toggleBackendMode, right: toggleBackendMode },
      1: { left: openKeyEntry, right: openKeyEntry },
      2: { left: () => cycleModel('left'), right: () => cycleModel('right') },
      3: { left: () => adjustTemperature('left'), right: () => adjustTemperature('right') },
    });
    return () => settingsAdjustHandlers.set({});
  });

  const secondaryCards = [
    { button: 'LB', label: 'Back to Settings', icon: 'arrow_back' },
  ];
</script>

{#if editingApiKey}
  <div class="absolute inset-0 z-50 bg-[#0d1117]/90 flex items-center justify-center">
    <div class="bg-[#161b22] border border-[#30363d] rounded p-4 w-[420px] space-y-3">
      <h3 class="text-sm font-bold text-[#0df2f2] uppercase tracking-widest">Anthropic API Key</h3>
      <input
        id="api-key-input"
        type="password"
        bind:value={apiKeyInput}
        onkeydown={handleKeyInputKeydown}
        placeholder="sk-ant-api03-..."
        class="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#0df2f2] focus:outline-none"
      />
      <div class="flex gap-2 justify-end">
        <button onclick={cancelKeyEntry} class="px-3 py-1.5 text-xs text-slate-400 border border-[#30363d] rounded hover:border-slate-500">Cancel (Esc)</button>
        <button onclick={saveApiKey} class="px-3 py-1.5 text-xs text-[#0d1117] bg-[#0df2f2] rounded font-bold hover:bg-[#0df2f2]/80">Save (Enter)</button>
      </div>
    </div>
  </div>
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
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'D-PAD', label: 'Navigate' },
  ]}
/>
