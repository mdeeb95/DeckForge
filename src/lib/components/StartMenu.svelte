<script lang="ts">
  import { startMenuOpen, navigate } from '../stores/app';
  import { glyph } from '../input/inputMode.svelte';
  import { playNav, playClick, playMenuClose } from '../audio/sfx';

  let selectedIndex = $state(0);

  const items = [
    { button: 'A', label: 'Settings', icon: 'settings', action: () => { startMenuOpen.set(false); navigate('settings'); } },
    { button: 'B', label: 'Close Menu', icon: 'close', action: () => startMenuOpen.set(false) },
    { button: 'X', label: 'About', icon: 'info', action: () => showAbout() },
    { button: 'Y', label: 'Quit App', icon: 'power_settings_new', action: () => quitApp() },
  ];

  let aboutVisible = $state(false);

  function showAbout() {
    aboutVisible = !aboutVisible;
  }

  async function quitApp() {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      // Not in Tauri — just close menu
      console.log('[StartMenu] Quit: not in Tauri');
      startMenuOpen.set(false);
    }
  }

  // Handle keyboard input for the menu (captures when open)
  import { onMount, onDestroy } from 'svelte';

  function handleMenuInput(e: KeyboardEvent) {
    if (!$startMenuOpen) return;

    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); e.stopPropagation(); selectedIndex = Math.max(0, selectedIndex - 1); playNav(); break;
      case 'ArrowDown': e.preventDefault(); e.stopPropagation(); selectedIndex = Math.min(items.length - 1, selectedIndex + 1); playNav(); break;
      case 'Enter': e.preventDefault(); e.stopPropagation(); playClick(); items[selectedIndex].action(); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); playMenuClose(); items[1].action(); break;
      case 'q': e.preventDefault(); e.stopPropagation(); playClick(); items[2].action(); break;
      case 'e': e.preventDefault(); e.stopPropagation(); playClick(); items[3].action(); break;
      case 'm': e.preventDefault(); e.stopPropagation(); playMenuClose(); startMenuOpen.set(false); break;
      default: e.stopPropagation(); break;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleMenuInput, true);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleMenuInput, true);
  });

  // Reset selection when menu opens
  $effect(() => {
    if ($startMenuOpen) {
      selectedIndex = 0;
      aboutVisible = false;
    }
  });
</script>

{#if $startMenuOpen}
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
    <!-- Menu card -->
    <div class="w-[280px] bg-surface-dark border border-surface-border rounded shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="px-4 py-3 border-b border-surface-border flex items-center gap-2">
        <span class="material-icons text-primary text-sm">menu</span>
        <span class="text-xs font-bold text-primary uppercase tracking-wider">Menu</span>
      </div>

      <!-- Items -->
      <div class="p-2 space-y-1">
        {#each items as item, i}
          <div class="flex items-center gap-3 px-3 py-2 rounded transition-colors {i === selectedIndex ? 'bg-primary/10 border border-primary/30' : 'border border-transparent'}">
            <div class="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold {i === selectedIndex ? 'bg-primary text-black' : 'bg-slate-700 text-slate-300'}">{glyph(item.button)}</div>
            <span class="material-icons text-sm {i === selectedIndex ? 'text-primary' : 'text-slate-400'}">{item.icon}</span>
            <span class="text-sm {i === selectedIndex ? 'text-primary font-medium' : 'text-slate-300'}">{item.label}</span>
          </div>
        {/each}
      </div>

      <!-- About panel (shown when X is pressed) -->
      {#if aboutVisible}
        <div class="px-4 py-3 border-t border-surface-border bg-[#0b0e11]">
          <p class="text-[10px] text-slate-400 font-mono leading-relaxed">
            DeckForge v0.1.0<br/>
            Steam Deck gamepad-only interface for Claude Code<br/>
            Tauri 2 + Svelte 5 + TypeScript
          </p>
        </div>
      {/if}

      <!-- Footer hint -->
      <div class="px-4 py-2 border-t border-surface-border">
        <span class="text-[10px] text-slate-500 font-mono">{glyph('START')}  Close</span>
      </div>
    </div>
  </div>
{/if}
