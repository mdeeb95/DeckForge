<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards, splitRatio } from '../stores/app';
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
    entries.addEntry({ type: 'timestamp', time: now, message: `Scanlines: ${config.display.scanline_overlay ? 'on' : 'off'}` });
    entries.addEntry({ type: 'timestamp', time: now, message: `Theme: ${config.display.theme}` });
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

  function toggleScanlines() {
    updateGlobalConfig(cfg => {
      const newVal = !cfg.display.scanline_overlay;
      entries.addEntry({ type: 'thought', label: 'SCANLINES', body: `→ ${newVal ? 'on' : 'off'}` });
      return { ...cfg, display: { ...cfg.display, scanline_overlay: newVal } };
    });
  }

  function adjustScrollSpeed(direction: 'left' | 'right') {
    const delta = direction === 'right' ? 0.25 : -0.25;
    updateGlobalConfig(cfg => {
      const newSpeed = Math.max(0.25, Math.min(4, +(cfg.input.stick_scroll_speed + delta).toFixed(2)));
      entries.addEntry({ type: 'thought', label: 'SCROLL SPEED', body: `→ ${newSpeed}x` });
      return { ...cfg, input: { ...cfg.input, stick_scroll_speed: newSpeed } };
    });
  }

  const config = get(globalConfig);

  const cards = [
    {
      button: 'A',
      title: 'Split Ratio',
      description: 'DPAD L/R to adjust terminal width (live preview)',
      pills: [{ label: `${config?.display.default_split_ratio ?? 55}%`, variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => adjustSplitRatio('right'),
    },
    {
      button: 'B',
      title: 'Scanline Overlay',
      description: 'CRT-style scanlines on the terminal',
      pills: [{ label: config?.display.scanline_overlay ? 'on' : 'off', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: toggleScanlines,
    },
    {
      button: 'X',
      title: 'Theme',
      description: 'more themes coming soon',
      pills: [{ label: config?.display.theme ?? 'default', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => { entries.addEntry({ type: 'thought', label: 'THEME', body: 'Only "default" available for now' }); },
    },
    {
      button: 'Y',
      title: 'Stick Scroll Speed',
      description: 'DPAD L/R to adjust (0.25x – 4.0x)',
      pills: [{ label: `${config?.input.stick_scroll_speed ?? 1.0}x`, variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: () => adjustScrollSpeed('right'),
    },
  ];

  const secondaryCards = [
    { button: 'LB', label: 'Back to Settings', icon: 'arrow_back' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
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
    { key: 'A/B/X/Y', label: 'Toggle' },
    { key: 'D-PAD L/R', label: 'Adjust' },
    { key: 'LB', label: 'Back' },
  ]}
/>
