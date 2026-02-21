<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards, splitRatio } from '../stores/app';
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
    entries.addEntry({ type: 'prompt', label: 'DISPLAY & INPUT', body: 'Visual and input settings' });
    entries.addEntry({ type: 'timestamp', time: now, message: `Split Ratio: <span class="text-primary">${config.display.default_split_ratio}%</span>` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Stick Scroll Speed: ${config.input.stick_scroll_speed}x` });
    entries.addEntry({ type: 'cursor', message: 'Press A to select, DPAD L/R to adjust values' });
  });

  function adjustSplitRatio(direction: 'left' | 'right') {
    const delta = direction === 'right' ? 5 : -5;
    const config = get(globalConfig);
    if (!config) return;
    const newRatio = Math.max(20, Math.min(80, config.display.default_split_ratio + delta));
    updateGlobalConfig(cfg => ({
      ...cfg,
      display: { ...cfg.display, default_split_ratio: newRatio },
    }));
    // Live preview
    splitRatio.set(newRatio);
    entries.addEntry({ type: 'thought', label: 'SPLIT', body: `→ ${newRatio}%` });
  }

  function adjustScrollSpeed(direction: 'left' | 'right') {
    const delta = direction === 'right' ? 0.25 : -0.25;
    updateGlobalConfig(cfg => {
      const newSpeed = Math.max(0.25, Math.min(4, +(cfg.input.stick_scroll_speed + delta).toFixed(2)));
      entries.addEntry({ type: 'thought', label: 'SCROLL SPEED', body: `→ ${newSpeed}x` });
      return { ...cfg, input: { ...cfg.input, stick_scroll_speed: newSpeed } };
    });
  }

  // Reactive cards — recompute whenever globalConfig changes
  const cfg = $derived($globalConfig);

  const cards = $derived.by(() => {
    const c = cfg;
    if (!c) return [];
    return [
      {
        title: 'Split Ratio',
        description: 'A to increase, DPAD L/R to adjust (20% – 80%)',
        pills: [{ label: `${c.display.default_split_ratio}%`, variant: 'active' as const }],
        variant: 'primary' as const,
        onclick: () => adjustSplitRatio('right'),
      },
      {
        title: 'Stick Scroll Speed',
        description: 'A to increase, DPAD L/R to adjust (0.25x – 4.0x)',
        pills: [{ label: `${c.input.stick_scroll_speed}x`, variant: 'neutral' as const }],
        variant: 'secondary_pink' as const,
        onclick: () => adjustScrollSpeed('right'),
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
      0: { left: () => adjustSplitRatio('left'), right: () => adjustSplitRatio('right') },
      1: { left: () => adjustScrollSpeed('left'), right: () => adjustScrollSpeed('right') },
    });
    return () => settingsAdjustHandlers.set({});
  });

  const secondaryCards = [
    { button: 'LB', label: 'Back to Settings', icon: 'arrow_back' },
  ];
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Settings / Display"
  step={0}
  title="Display & Input"
  subtitle="Visual appearance and controls"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  hints={[
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'D-PAD', label: 'Navigate' },
  ]}
/>
