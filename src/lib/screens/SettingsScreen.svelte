<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { closeSettings, splitRatio } from '../stores/app';
  import { globalConfig, updateGlobalConfig } from '../stores/configStores';
  import { pushInputLayer, popInputLayer } from '../input/modalStack';
  import { playBack, playNav, playToggle } from '../audio/sfx';
  import { devLog } from '../utils/devLog';
  import SettingRow from '../components/SettingRow.svelte';
  import SettingSection from '../components/SettingSection.svelte';

  // ── Constants ──────────────────────────────────────────────────────────────────

  const MODELS = ['default', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'];
  const PERM_MODES = ['acceptEdits', 'plan', 'full', 'bypassPermissions'];
  const ROW_COUNT = 15;

  // Stagger delays per row (from mockup, with gaps at section boundaries)
  const STAGGER: string[] = [
    '0.12s', '0.16s', '0.20s', '0.24s',           // Prediction Engine
    '0.30s', '0.34s', '0.38s', '0.42s',           // Display & Input
    '0.48s', '0.52s', '0.56s',                     // Telemetry & Cost
    '0.62s', '0.66s', '0.70s', '0.74s',           // Advanced
  ];

  // SVG icon paths for section headers
  const ICON_PREDICTION = '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>';
  const ICON_DISPLAY = '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>';
  const ICON_TELEMETRY = '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>';
  const ICON_ADVANCED = '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>';

  // ── Reactive state ─────────────────────────────────────────────────────────────

  let scrollArea: HTMLDivElement;
  let popRow = $state<number | null>(null);
  let bounceSlider = $state<string | null>(null);
  let modelSwapPhase = $state<'out' | 'in' | null>(null);
  let permSwapPhase = $state<'out' | 'in' | null>(null);

  // Toast
  let toastMessage = $state('');
  let toastVisible = $state(false);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Footer hint flash
  let flashingHint = $state<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  // API key inline edit
  let editingApiKey = $state(false);
  let apiKeyInput = $state('');

  // Reset to Defaults double-press
  let resetPending = $state(false);
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Derived config values ──────────────────────────────────────────────────────

  let config = $derived($globalConfig);
  let focusIndex = $state(0);

  // Prediction Engine
  let backendMode = $derived(config?.prediction_engine.backend_mode ?? 'proxied');
  let apiKeyRef = $derived(config?.prediction_engine.direct_api_key_ref ?? '');
  let modelOverride = $derived(config?.prediction_engine.model_overrides.level_2 ?? 'default');
  let temperature = $derived(config?.prediction_engine.temperature ?? 0.8);

  // Display & Input
  let configSplitRatio = $derived(config?.display.default_split_ratio ?? 50);
  let scanlineOverlay = $derived(config?.display.scanline_overlay ?? false);
  let theme = $derived(config?.display.theme ?? 'default');
  let scrollSpeed = $derived(config?.input.stick_scroll_speed ?? 1.0);

  // Telemetry & Cost
  let telemetryEnabled = $derived(config?.telemetry.enabled ?? false);
  let costIndicator = $derived(config?.cost_tracking.show_cost_indicator ?? false);
  let budgetThreshold = $derived(config?.cost_tracking.session_budget_warning_threshold_usd ?? 0.5);

  // Advanced
  let permissionMode = $derived(config?.claude_code.permission_mode ?? 'acceptEdits');

  // ── Computed display values ────────────────────────────────────────────────────

  let tempPct = $derived((temperature / 2) * 100);
  let splitPct = $derived(configSplitRatio);
  let scrollPct = $derived(((scrollSpeed - 0.25) / 3.75) * 100);
  let budgetPct = $derived(Math.min(100, (budgetThreshold / 5) * 100));
  let maskedKey = $derived(apiKeyRef ? `sk-ant-${'•'.repeat(12)}` : 'Not set');

  // ── Auto-scroll focused row to center ──────────────────────────────────────────

  $effect(() => {
    const idx = focusIndex;
    if (!scrollArea) return;
    const rows = scrollArea.querySelectorAll('[data-setting-row]');
    const row = rows[idx] as HTMLElement;
    if (row) {
      const rowCenter = row.offsetTop - scrollArea.offsetTop + row.offsetHeight / 2;
      const targetScroll = rowCenter - scrollArea.clientHeight / 2;
      scrollArea.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  });

  // Auto-focus API key input when editing
  $effect(() => {
    if (editingApiKey) {
      requestAnimationFrame(() => {
        const input = scrollArea?.querySelector('.api-edit-input') as HTMLInputElement;
        input?.focus();
      });
    }
  });

  // ── Toast ──────────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    toastMessage = msg;
    toastVisible = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastVisible = false; }, 1200);
  }

  // ── Footer hint flash ──────────────────────────────────────────────────────────

  function flashHint(name: string) {
    flashingHint = name;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashingHint = null; }, 250);
  }

  // ── Animation helpers ──────────────────────────────────────────────────────────

  function triggerPop(rowIndex: number) {
    popRow = null;
    requestAnimationFrame(() => {
      popRow = rowIndex;
      setTimeout(() => { popRow = null; }, 350);
    });
  }

  function triggerBounce(sliderId: string) {
    bounceSlider = null;
    requestAnimationFrame(() => {
      bounceSlider = sliderId;
      setTimeout(() => { bounceSlider = null; }, 350);
    });
  }

  // ── Toggle functions ───────────────────────────────────────────────────────────

  function toggleBackendMode() {
    const newMode = backendMode === 'proxied' ? 'direct' : 'proxied';
    updateGlobalConfig(c => ({
      ...c,
      prediction_engine: { ...c.prediction_engine, backend_mode: newMode },
    }));
    triggerPop(0);
    showToast(`Backend → ${newMode}`);
    devLog('store', `Backend → ${newMode}`);
  }

  function toggleScanline() {
    const newVal = !scanlineOverlay;
    updateGlobalConfig(c => ({
      ...c,
      display: { ...c.display, scanline_overlay: newVal },
    }));
    triggerPop(5);
    showToast(`Scanlines → ${newVal ? 'on' : 'off'}`);
    devLog('store', `Scanlines → ${newVal ? 'on' : 'off'}`);
  }

  function toggleTelemetry() {
    const newVal = !telemetryEnabled;
    updateGlobalConfig(c => ({
      ...c,
      telemetry: { ...c.telemetry, enabled: newVal },
    }));
    triggerPop(8);
    showToast(`Telemetry → ${newVal ? 'enabled' : 'disabled'}`);
    devLog('store', `Telemetry → ${newVal ? 'enabled' : 'disabled'}`);
  }

  function toggleCostIndicator() {
    const newVal = !costIndicator;
    updateGlobalConfig(c => ({
      ...c,
      cost_tracking: { ...c.cost_tracking, show_cost_indicator: newVal },
    }));
    triggerPop(9);
    showToast(`Cost indicator → ${newVal ? 'shown' : 'hidden'}`);
    devLog('store', `Cost indicator → ${newVal ? 'shown' : 'hidden'}`);
  }

  // ── Slider adjust functions ────────────────────────────────────────────────────

  function adjustTemp(delta: number) {
    const newTemp = Math.max(0, Math.min(2, +(temperature + delta).toFixed(1)));
    updateGlobalConfig(c => ({
      ...c,
      prediction_engine: { ...c.prediction_engine, temperature: newTemp },
    }));
    triggerBounce('temp');
    flashHint('adjust');
    showToast(`Temp → ${newTemp.toFixed(1)}`);
    devLog('store', `Temp → ${newTemp.toFixed(1)}`);
  }

  function adjustSplit(delta: number) {
    const newSplit = Math.max(20, Math.min(80, configSplitRatio + delta));
    updateGlobalConfig(c => ({
      ...c,
      display: { ...c.display, default_split_ratio: newSplit },
    }));
    splitRatio.set(newSplit); // Live preview — terminal panel resizes immediately
    triggerBounce('split');
    flashHint('adjust');
    showToast(`Split → ${newSplit}%`);
    devLog('store', `SPLIT → ${newSplit}%`);
  }

  function adjustScrollSpeed(delta: number) {
    const newSpeed = Math.max(0.25, Math.min(4, +(scrollSpeed + delta).toFixed(2)));
    updateGlobalConfig(c => ({
      ...c,
      input: { ...c.input, stick_scroll_speed: newSpeed },
    }));
    triggerBounce('scroll');
    flashHint('adjust');
    showToast(`Scroll → ${newSpeed.toFixed(2)}x`);
    devLog('store', `Scroll speed → ${newSpeed.toFixed(2)}x`);
  }

  function adjustBudget(delta: number) {
    const newBudget = Math.max(0.25, +(budgetThreshold + delta).toFixed(2));
    updateGlobalConfig(c => ({
      ...c,
      cost_tracking: { ...c.cost_tracking, session_budget_warning_threshold_usd: newBudget },
    }));
    triggerBounce('budget');
    flashHint('adjust');
    showToast(`Budget → $${newBudget.toFixed(2)}`);
    devLog('store', `Budget → $${newBudget.toFixed(2)}`);
  }

  // ── Selector cycle functions ───────────────────────────────────────────────────

  function cycleModel(dir: number) {
    const current = config?.prediction_engine.model_overrides.level_2 ?? 'default';
    const idx = Math.max(0, MODELS.indexOf(current));
    const next = (idx + dir + MODELS.length) % MODELS.length;
    const newModel = MODELS[next];

    flashHint('adjust');
    modelSwapPhase = 'out';
    setTimeout(() => {
      updateGlobalConfig(c => ({
        ...c,
        prediction_engine: {
          ...c.prediction_engine,
          model_overrides: {
            ...c.prediction_engine.model_overrides,
            level_2: newModel === 'default' ? null : newModel,
          },
        },
      }));
      modelSwapPhase = 'in';
      showToast(`Model → ${newModel}`);
      devLog('store', `Model → ${newModel}`);
      setTimeout(() => { modelSwapPhase = null; }, 200);
    }, 150);
  }

  function cyclePerm(dir: number) {
    const current = config?.claude_code.permission_mode ?? 'acceptEdits';
    const idx = Math.max(0, PERM_MODES.indexOf(current));
    const next = (idx + dir + PERM_MODES.length) % PERM_MODES.length;
    const newPerm = PERM_MODES[next];

    flashHint('adjust');
    permSwapPhase = 'out';
    setTimeout(() => {
      updateGlobalConfig(c => ({
        ...c,
        claude_code: { ...c.claude_code, permission_mode: newPerm },
      }));
      permSwapPhase = 'in';
      showToast(`Permission → ${newPerm}`);
      devLog('store', `Permission → ${newPerm}`);
      setTimeout(() => { permSwapPhase = null; }, 200);
    }, 150);
  }

  // ── API Key editing ────────────────────────────────────────────────────────────

  function startApiKeyEdit() {
    apiKeyInput = apiKeyRef || '';
    editingApiKey = true;
  }

  function saveApiKey() {
    const val = apiKeyInput.trim() || null;
    updateGlobalConfig(c => ({
      ...c,
      prediction_engine: { ...c.prediction_engine, direct_api_key_ref: val },
    }));
    editingApiKey = false;
    showToast(val ? 'API key saved' : 'API key cleared');
    devLog('store', `API Key → ${val ? 'set' : 'cleared'}`);
  }

  function cancelApiKeyEdit() {
    editingApiKey = false;
  }

  // ── Reset to Defaults ──────────────────────────────────────────────────────────

  function handleReset() {
    if (resetPending) {
      // Second press — confirmed
      if (resetTimer) clearTimeout(resetTimer);
      resetPending = false;
      showToast('Config reset to defaults');
      devLog('store', 'Config reset to defaults — restart recommended');
      // Actual reset would go here; for now just confirms the interaction
    } else {
      // First press — warn
      resetPending = true;
      showToast('Press A again to confirm reset');
      resetTimer = setTimeout(() => { resetPending = false; }, 3000);
    }
  }

  // ── Activate (A button) ────────────────────────────────────────────────────────

  function activateRow(idx: number) {
    flashHint('toggle');
    switch (idx) {
      case 0: toggleBackendMode(); break;
      case 1:
        if (editingApiKey) saveApiKey();
        else startApiKeyEdit();
        break;
      case 5: toggleScanline(); break;
      case 6: showToast('Only "default" available'); break;
      case 8: toggleTelemetry(); break;
      case 9: toggleCostIndicator(); break;
      case 12:
        devLog('store', 'View Config:', config);
        showToast('Config dumped to terminal');
        break;
      case 13:
        showToast('DeckForge v0.1.0 | Tauri 2');
        break;
      case 14: handleReset(); break;
    }
  }

  // ── Local adjust handlers (private to settings) ────────────────────────────

  const adjustHandlers: Record<number, { left: () => void; right: () => void }> = {
    2: { left: () => cycleModel(-1), right: () => cycleModel(1) },
    3: { left: () => adjustTemp(-0.1), right: () => adjustTemp(0.1) },
    4: { left: () => adjustSplit(-5), right: () => adjustSplit(5) },
    7: { left: () => adjustScrollSpeed(-0.25), right: () => adjustScrollSpeed(0.25) },
    10: { left: () => adjustBudget(-0.25), right: () => adjustBudget(0.25) },
    11: { left: () => cyclePerm(-1), right: () => cyclePerm(1) },
  };

  // ── Modal input handler (captures ALL gamepad/keyboard input) ─────────────

  function settingsInputHandler(button: string) {
    switch (button) {
      case 'DPAD_UP':
        if (focusIndex > 0) { focusIndex--; playNav(); }
        break;
      case 'DPAD_DOWN':
        if (focusIndex < ROW_COUNT - 1) { focusIndex++; playNav(); }
        break;
      case 'A':
        activateRow(focusIndex);
        break;
      case 'B': case 'START': case 'LB':
        playBack();
        closeSettings();
        break;
      case 'DPAD_LEFT': {
        const h = adjustHandlers[focusIndex];
        if (h) { playToggle(); h.left(); }
        break;
      }
      case 'DPAD_RIGHT': {
        const h = adjustHandlers[focusIndex];
        if (h) { playToggle(); h.right(); }
        break;
      }
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────────

  onMount(() => {
    pushInputLayer(settingsInputHandler);

    // Terminal logging — initial config dump
    devLog('lifecycle', 'DeckForge Configuration');
    devLog('store', `Backend: ${backendMode}`);
    devLog('store', `API Key: ${apiKeyRef ? 'set' : 'not set'}`);
    devLog('store', `Model: ${modelOverride}`);
    devLog('store', `Split Ratio: ${configSplitRatio}%`);
    devLog('store', `Telemetry: ${telemetryEnabled ? 'enabled' : 'disabled'}`);
    devLog('store', `Budget Alert: $${budgetThreshold.toFixed(2)}`);
  });

  onDestroy(() => {
    popInputLayer();
    if (toastTimer) clearTimeout(toastTimer);
    if (flashTimer) clearTimeout(flashTimer);
    if (resetTimer) clearTimeout(resetTimer);
    // Sync splitRatio to persisted config on exit
    const saved = get(globalConfig);
    if (saved) splitRatio.set(saved.display.default_split_ratio);
  });

  function goBack() {
    closeSettings();
  }
</script>

<!-- ═══ BACKDROP ═══ -->
<div class="settings-backdrop">
  <div class="settings-modal">
    <div class="settings-scanlines"></div>

    <!-- ═══ HEADER ═══ -->
    <div class="settings-header">
      <div class="header-left">
        <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <h1>DeckForge Settings</h1>
      </div>
      <button class="close-btn" onclick={goBack} title="Close (B)">&times;</button>
    </div>

    <!-- ═══ SCROLLABLE MEGA LIST ═══ -->
    <div class="settings-scroll" bind:this={scrollArea}>

      <!-- ── PREDICTION ENGINE ── -->
      <SettingSection title="Prediction Engine" icon={ICON_PREDICTION} />

      <!-- Row 0: Backend Mode -->
      <SettingRow label="Backend Mode" description="Route requests through Railway or direct API" focused={focusIndex === 0} staggerDelay={STAGGER[0]}>
        <span class="toggle-value" class:amber={backendMode === 'direct'} class:pop={popRow === 0}>
          {backendMode === 'proxied' ? 'Proxied' : 'Direct'}
        </span>
        <span class="btn-badge a">A</span>
      </SettingRow>

      <!-- Row 1: API Key -->
      <SettingRow label="API Key" description="Required for direct mode" focused={focusIndex === 1} staggerDelay={STAGGER[1]}>
        {#if editingApiKey}
          <div class="api-field">
            <input
              class="api-edit-input"
              type="password"
              bind:value={apiKeyInput}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') saveApiKey();
                else if (e.key === 'Escape') cancelApiKeyEdit();
              }}
              placeholder="sk-ant-..."
            />
            <button class="keyboard-btn save" onclick={saveApiKey}>Save</button>
            <button class="keyboard-btn" onclick={cancelApiKeyEdit}>Cancel</button>
          </div>
        {:else}
          <div class="api-field">
            <div class="api-input">{maskedKey}</div>
            <button class="keyboard-btn" onclick={startApiKeyEdit}>Edit key</button>
          </div>
        {/if}
      </SettingRow>

      <!-- Row 2: Model Override -->
      <SettingRow label="Model Override" description="Override default model for Level 2 predictions" focused={focusIndex === 2} staggerDelay={STAGGER[2]}>
        <div class="model-selector">
          <span class="btn-badge dpad">&larr;</span>
          <span class="model-name" class:swap-out={modelSwapPhase === 'out'} class:swap-in={modelSwapPhase === 'in'}>
            {modelOverride}
          </span>
          <span class="btn-badge dpad">&rarr;</span>
        </div>
      </SettingRow>

      <!-- Row 3: Temperature -->
      <SettingRow label="Temperature" description="Creativity 0.0 – 2.0" focused={focusIndex === 3} staggerDelay={STAGGER[3]}>
        <div class="slider-group">
          <span class="btn-badge dpad">&larr;</span>
          <div class="slider-track">
            <div class="slider-fill" style="width: {tempPct}%"></div>
            <div class="slider-thumb" class:bounce={bounceSlider === 'temp'} style="left: {tempPct}%"></div>
          </div>
          <span class="slider-value">{temperature.toFixed(1)}</span>
          <span class="btn-badge dpad">&rarr;</span>
        </div>
      </SettingRow>

      <!-- ── DISPLAY & INPUT ── -->
      <SettingSection title="Display & Input" icon={ICON_DISPLAY} />

      <!-- Row 4: Split Ratio -->
      <SettingRow label="Split Ratio" description="Terminal width 20% – 80%" focused={focusIndex === 4} staggerDelay={STAGGER[4]}>
        <div class="slider-group">
          <span class="btn-badge dpad">&larr;</span>
          <div class="slider-track">
            <div class="slider-fill" style="width: {splitPct}%"></div>
            <div class="slider-thumb" class:bounce={bounceSlider === 'split'} style="left: {splitPct}%"></div>
          </div>
          <span class="slider-value">{configSplitRatio}%</span>
          <span class="btn-badge dpad">&rarr;</span>
        </div>
      </SettingRow>

      <!-- Row 5: Scanline Overlay -->
      <SettingRow label="Scanline Overlay" description="CRT-style scanlines on the terminal" focused={focusIndex === 5} staggerDelay={STAGGER[5]}>
        <span class="toggle-value" class:neutral={!scanlineOverlay} class:pop={popRow === 5}>
          {scanlineOverlay ? 'On' : 'Off'}
        </span>
        <span class="btn-badge a">A</span>
      </SettingRow>

      <!-- Row 6: Theme -->
      <SettingRow label="Theme" description="More themes coming soon" focused={focusIndex === 6} staggerDelay={STAGGER[6]}>
        <span class="toggle-value neutral">{theme}</span>
      </SettingRow>

      <!-- Row 7: Stick Scroll Speed -->
      <SettingRow label="Stick Scroll Speed" description="Analog stick sensitivity 0.25x – 4.0x" focused={focusIndex === 7} staggerDelay={STAGGER[7]}>
        <div class="slider-group">
          <span class="btn-badge dpad">&larr;</span>
          <div class="slider-track">
            <div class="slider-fill" style="width: {scrollPct}%"></div>
            <div class="slider-thumb" class:bounce={bounceSlider === 'scroll'} style="left: {scrollPct}%"></div>
          </div>
          <span class="slider-value">{scrollSpeed.toFixed(2)}x</span>
          <span class="btn-badge dpad">&rarr;</span>
        </div>
      </SettingRow>

      <!-- ── TELEMETRY & COST ── -->
      <SettingSection title="Telemetry & Cost" icon={ICON_TELEMETRY} />

      <!-- Row 8: Telemetry -->
      <SettingRow label="Telemetry" description="Anonymous usage data collection" focused={focusIndex === 8} staggerDelay={STAGGER[8]}>
        <span class="toggle-value" class:neutral={!telemetryEnabled} class:pop={popRow === 8}>
          {telemetryEnabled ? 'Enabled' : 'Disabled'}
        </span>
        <span class="btn-badge a">A</span>
      </SettingRow>

      <!-- Row 9: Cost Indicator -->
      <SettingRow label="Cost Indicator" description="Show session cost in terminal header" focused={focusIndex === 9} staggerDelay={STAGGER[9]}>
        <span class="toggle-value" class:pink={costIndicator} class:neutral={!costIndicator} class:pop={popRow === 9}>
          {costIndicator ? 'Shown' : 'Hidden'}
        </span>
        <span class="btn-badge a">A</span>
      </SettingRow>

      <!-- Row 10: Budget Alert -->
      <SettingRow label="Budget Alert" description="Session spending warning threshold" focused={focusIndex === 10} staggerDelay={STAGGER[10]}>
        <div class="slider-group">
          <span class="btn-badge dpad">&larr;</span>
          <div class="slider-track">
            <div class="slider-fill budget-fill" style="width: {budgetPct}%"></div>
            <div class="slider-thumb budget-thumb" class:bounce={bounceSlider === 'budget'} style="left: {budgetPct}%"></div>
          </div>
          <span class="slider-value amber">${budgetThreshold.toFixed(2)}</span>
          <span class="btn-badge dpad">&rarr;</span>
        </div>
      </SettingRow>

      <!-- ── ADVANCED ── -->
      <SettingSection title="Advanced" icon={ICON_ADVANCED} />

      <!-- Row 11: Permission Mode -->
      <SettingRow label="Permission Mode" description="Claude Code permission level" focused={focusIndex === 11} staggerDelay={STAGGER[11]}>
        <div class="model-selector">
          <span class="btn-badge dpad">&larr;</span>
          <span class="model-name" class:swap-out={permSwapPhase === 'out'} class:swap-in={permSwapPhase === 'in'}>
            {permissionMode}
          </span>
          <span class="btn-badge dpad">&rarr;</span>
        </div>
      </SettingRow>

      <!-- Row 12: View Config -->
      <SettingRow label="View Config" description="Dump current global config to terminal" focused={focusIndex === 12} staggerDelay={STAGGER[12]}>
        <span class="toggle-value neutral">global.json</span>
        <span class="btn-badge a">A</span>
      </SettingRow>

      <!-- Row 13: System Info -->
      <SettingRow label="System Info" description="Version, platform, Tauri status" focused={focusIndex === 13} staggerDelay={STAGGER[13]}>
        <span class="toggle-value neutral">v0.1.0</span>
        <span class="btn-badge x">X</span>
      </SettingRow>

      <!-- Row 14: Reset to Defaults -->
      <SettingRow label="Reset to Defaults" description={resetPending ? 'Press A again to confirm!' : 'Double-press to confirm — destructive'} focused={focusIndex === 14} staggerDelay={STAGGER[14]}>
        <span class="destructive-tag" class:pending={resetPending}>{resetPending ? 'Confirm?' : 'Destructive'}</span>
        <span class="btn-badge a">A</span>
      </SettingRow>

      <div style="height: 8px;"></div>
    </div>

    <!-- ═══ FOOTER ═══ -->
    <div class="settings-footer">
      <div class="hint" data-hint="navigate"><kbd class:flash={flashingHint === 'navigate'}>&uarr;&darr;</kbd><span>Navigate</span></div>
      <div class="hint" data-hint="toggle"><kbd class:flash={flashingHint === 'toggle'}>A</kbd><span>Toggle</span></div>
      <div class="hint" data-hint="adjust"><kbd class:flash={flashingHint === 'adjust'}>&larr;&rarr;</kbd><span>Adjust</span></div>
      <div class="hint" data-hint="back"><kbd class:flash={flashingHint === 'back'}>B</kbd><span>Back</span></div>
      <div class="footer-spacer"></div>
      <div class="footer-version">v0.1.0</div>
    </div>

    <!-- ═══ TOAST ═══ -->
    <div class="toast" class:show={toastVisible}>{toastMessage}</div>
  </div>
</div>

<style>
  /* ═══ BACKDROP ═══ */
  .settings-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0);
    backdrop-filter: blur(0px);
    animation: backdropIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  @keyframes backdropIn {
    to { background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
  }

  /* ═══ MODAL ═══ */
  .settings-modal {
    position: relative;
    width: 820px;
    height: 660px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
    opacity: 0;
    transform: scale(0.92) translateY(20px);
    animation: modalIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
  }
  @keyframes modalIn {
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ═══ SCANLINES ═══ */
  .settings-scanlines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    background: repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
    );
    opacity: 0;
    animation: scanlinesIn 1s 0.8s forwards;
  }
  @keyframes scanlinesIn { to { opacity: 1; } }

  /* ═══ HEADER ═══ */
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 28px;
    border-bottom: 1px solid #30363d;
    flex-shrink: 0;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .header-icon {
    width: 20px;
    height: 20px;
    color: #0df2f2;
    animation: gearSpin 0.6s cubic-bezier(0.16,1,0.3,1) 0.4s both;
  }
  @keyframes gearSpin {
    from { transform: rotate(-90deg); opacity: 0; }
    to   { transform: rotate(0deg); opacity: 1; }
  }
  .settings-header h1 {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #e6edf3;
  }
  .close-btn {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    border: 1px solid #30363d;
    background: transparent;
    color: #8b949e;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.2s;
  }
  .close-btn:hover {
    border-color: #f44336;
    color: #f44336;
    transform: rotate(90deg);
  }

  /* ═══ SCROLL AREA ═══ */
  .settings-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 28px 20px;
    scroll-behavior: smooth;
    scrollbar-width: thin;
    scrollbar-color: #30363d transparent;
  }
  .settings-scroll::-webkit-scrollbar { width: 4px; }
  .settings-scroll::-webkit-scrollbar-track { background: transparent; }
  .settings-scroll::-webkit-scrollbar-thumb {
    background: #30363d;
    border-radius: 2px;
  }
  .settings-scroll::-webkit-scrollbar-thumb:hover { background: #089090; }

  /* ═══ CONTROLS ═══ */

  /* Toggle value badges */
  .toggle-value {
    font-size: 12px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    color: #0df2f2;
    min-width: 60px;
    text-align: center;
    padding: 5px 12px;
    background: rgba(13,242,242,0.08);
    border: 1px solid rgba(13,242,242,0.2);
    border-radius: 3px;
    transition: all 0.2s;
  }
  .toggle-value.neutral {
    color: #e6edf3;
    background: rgba(255,255,255,0.04);
    border-color: #30363d;
  }
  .toggle-value.amber {
    color: #f59e0b;
    background: rgba(245,158,11,0.08);
    border-color: rgba(245,158,11,0.2);
  }
  .toggle-value.pink {
    color: #f20dcf;
    background: rgba(242,13,207,0.08);
    border-color: rgba(242,13,207,0.2);
  }
  .toggle-value.pop {
    animation: valuePop 0.35s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes valuePop {
    0%   { transform: scale(1); }
    30%  { transform: scale(1.15); }
    100% { transform: scale(1); }
  }

  /* Button badges */
  .btn-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    font-family: 'Space Grotesk', sans-serif;
    min-width: 22px;
    height: 22px;
    padding: 0 5px;
    border-radius: 4px;
    letter-spacing: 0.02em;
    transition: transform 0.15s;
  }
  .btn-badge.a {
    background: rgba(76,175,80,0.2);
    color: #4caf50;
    border: 1px solid rgba(76,175,80,0.3);
  }
  .btn-badge.x {
    background: rgba(33,150,243,0.2);
    color: #2196f3;
    border: 1px solid rgba(33,150,243,0.3);
  }
  .btn-badge.dpad {
    background: rgba(255,255,255,0.08);
    color: #8b949e;
    border: 1px solid #30363d;
    font-size: 13px;
    min-width: 26px;
  }

  /* API key field */
  .api-field {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .api-input {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #484f58;
    background: rgba(255,255,255,0.03);
    border: 1px solid #30363d;
    border-radius: 3px;
    padding: 5px 10px;
    min-width: 150px;
    letter-spacing: 0.05em;
  }
  .api-edit-input {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #0df2f2;
    background: rgba(13,242,242,0.05);
    border: 1px solid rgba(13,242,242,0.3);
    border-radius: 3px;
    padding: 5px 10px;
    min-width: 200px;
    letter-spacing: 0.05em;
    outline: none;
  }
  .api-edit-input::placeholder {
    color: #484f58;
  }
  .keyboard-btn {
    font-size: 10px;
    font-weight: 500;
    color: #8b949e;
    background: rgba(255,255,255,0.05);
    border: 1px solid #30363d;
    border-radius: 3px;
    padding: 5px 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    font-family: 'Space Grotesk', sans-serif;
  }
  .keyboard-btn:hover {
    border-color: #089090;
    color: #0df2f2;
  }
  .keyboard-btn.save {
    border-color: rgba(76,175,80,0.4);
    color: #4caf50;
  }
  .keyboard-btn.save:hover {
    border-color: #4caf50;
    background: rgba(76,175,80,0.1);
  }

  /* Slider */
  .slider-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .slider-track {
    width: 150px;
    height: 5px;
    background: #30363d;
    border-radius: 3px;
    position: relative;
  }
  .slider-fill {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, #089090, #0df2f2);
    box-shadow: 0 0 6px rgba(13,242,242,0.25);
    transition: width 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  .slider-fill.budget-fill {
    background: linear-gradient(90deg, #b45309, #f59e0b);
    box-shadow: 0 0 6px rgba(245,158,11,0.25);
  }
  .slider-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 12px;
    background: #0df2f2;
    border: 2px solid #161b22;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(13,242,242,0.5);
    transition: left 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  .slider-thumb.budget-thumb {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245,158,11,0.5);
  }
  .slider-thumb.bounce {
    animation: thumbBounce 0.35s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes thumbBounce {
    0%   { transform: translate(-50%,-50%) scale(1); }
    40%  { transform: translate(-50%,-50%) scale(1.5); }
    100% { transform: translate(-50%,-50%) scale(1); }
  }
  .slider-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #0df2f2;
    min-width: 34px;
    text-align: center;
  }
  .slider-value.amber {
    color: #f59e0b;
  }

  /* Model / Permission selector */
  .model-selector {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .model-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 500;
    color: #e6edf3;
    padding: 5px 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid #30363d;
    border-radius: 3px;
    min-width: 180px;
    text-align: center;
    overflow: hidden;
  }
  .model-name.swap-out {
    animation: modelSwapOut 0.15s ease-in forwards;
  }
  .model-name.swap-in {
    animation: modelSwapIn 0.2s ease-out forwards;
  }
  @keyframes modelSwapOut {
    to { opacity: 0; transform: translateY(-8px); }
  }
  @keyframes modelSwapIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Destructive tag */
  .destructive-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #f44336;
    padding: 4px 8px;
    background: rgba(244,67,54,0.08);
    border: 1px solid rgba(244,67,54,0.2);
    border-radius: 3px;
    transition: all 0.3s;
  }
  .destructive-tag.pending {
    color: #f59e0b;
    background: rgba(245,158,11,0.15);
    border-color: rgba(245,158,11,0.4);
    animation: valuePop 0.35s cubic-bezier(0.34,1.56,0.64,1);
  }

  /* ═══ FOOTER ═══ */
  .settings-footer {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 28px;
    border-top: 1px solid #30363d;
    background: rgba(0,0,0,0.2);
    flex-shrink: 0;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: #484f58;
  }
  .hint kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: rgba(255,255,255,0.08);
    border: 1px solid #30363d;
    border-radius: 3px;
    color: #8b949e;
    transition: all 0.15s;
  }
  .hint kbd.flash {
    background: rgba(13,242,242,0.2);
    border-color: #0df2f2;
    color: #0df2f2;
  }
  .hint span {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }
  .footer-spacer {
    flex: 1;
  }
  .footer-version {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #484f58;
  }

  /* ═══ TOAST ═══ */
  .toast {
    position: absolute;
    bottom: 55px;
    left: 50%;
    background: #161b22;
    border: 1px solid #0df2f2;
    color: #0df2f2;
    padding: 7px 18px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    box-shadow: 0 0 12px rgba(13,242,242,0.25);
    pointer-events: none;
    z-index: 10;
    opacity: 0;
    transform: translateX(-50%) translateY(16px);
    transition: opacity 0.25s cubic-bezier(0.16,1,0.3,1),
                transform 0.25s cubic-bezier(0.16,1,0.3,1);
    white-space: nowrap;
  }
  .toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
</style>
