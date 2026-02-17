<script lang="ts">
  import { keyboardOpen } from '../stores/app';

  interface Props {
    label: string;
    placeholder?: string;
    value?: string;
    masked?: boolean;
    maskAfter?: number;
    maxLength?: number;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  }

  let {
    label,
    placeholder = '',
    value = '',
    masked = false,
    maskAfter = 12,
    maxLength,
    onConfirm,
    onCancel,
  }: Props = $props();

  let inputValue = $state(value || '');
  let cursorRow = $state(0);
  let cursorCol = $state(0);
  let symbolMode = $state(false);

  const ALPHA_KEYS = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l','-'],
    ['z','x','c','v','b','n','m','_','.','/'],
  ];

  const SYMBOL_KEYS = [
    ['!','@','#','$','%','^','&','*','(',')'],
    ['~','`','+','=','[',']','{','}','|','\\'],
    [':',';','"','\'','<','>',',','?',' ','€'],
    ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⓪'],
  ];

  let currentKeys = $derived(symbolMode ? SYMBOL_KEYS : ALPHA_KEYS);
  let currentKey = $derived(currentKeys[cursorRow]?.[cursorCol] ?? '');

  let displayValue = $derived(() => {
    if (!masked || !inputValue) return inputValue;
    if (inputValue.length <= maskAfter) return inputValue;
    return inputValue.slice(0, maskAfter) + '•'.repeat(inputValue.length - maskAfter);
  });

  function typeKey() {
    if (maxLength && inputValue.length >= maxLength) return;
    inputValue += currentKey;
  }

  function backspace() {
    inputValue = inputValue.slice(0, -1);
  }

  function toggleSymbols() {
    symbolMode = !symbolMode;
  }

  function confirm() {
    keyboardOpen.set(false);
    onConfirm(inputValue);
  }

  function cancel() {
    keyboardOpen.set(false);
    onCancel();
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        inputValue += text;
        if (maxLength) inputValue = inputValue.slice(0, maxLength);
      }
    } catch {
      // Clipboard not available — ignore
    }
  }

  // Capture all gamepad input while keyboard is open
  function handleKeyboardInput(e: KeyboardEvent) {
    // Map keyboard keys to gamepad actions for dev testing
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); cursorRow = Math.max(0, cursorRow - 1); break;
      case 'ArrowDown': e.preventDefault(); cursorRow = Math.min(3, cursorRow + 1); break;
      case 'ArrowLeft': e.preventDefault(); cursorCol = Math.max(0, cursorCol - 1); break;
      case 'ArrowRight': e.preventDefault(); cursorCol = Math.min(9, cursorCol + 1); break;
      case 'Enter': e.preventDefault(); typeKey(); break;
      case 'Escape': e.preventDefault(); backspace(); break;
      case 'q': e.preventDefault(); toggleSymbols(); break;
      case 'e': e.preventDefault(); confirm(); break;
      case 'm': e.preventDefault(); cancel(); break;
      case 'Tab': e.preventDefault(); pasteFromClipboard(); break;
    }
  }

  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    keyboardOpen.set(true);
    window.addEventListener('keydown', handleKeyboardInput, true);
  });

  onDestroy(() => {
    keyboardOpen.set(false);
    window.removeEventListener('keydown', handleKeyboardInput, true);
  });
</script>

<!-- Full-screen keyboard overlay -->
<div class="fixed inset-0 z-40 bg-background-dark/95 backdrop-blur-sm flex flex-col items-center justify-center">
  <!-- Label -->
  <div class="mb-4">
    <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</span>
  </div>

  <!-- Input display -->
  <div class="w-[460px] bg-surface-dark border border-surface-border p-4 rounded mb-6 font-mono text-lg text-primary min-h-[52px] flex items-center">
    {#if inputValue}
      <span>{displayValue()}</span>
      <span class="w-0.5 h-5 bg-primary ml-0.5 animate-pulse"></span>
    {:else}
      <span class="text-slate-600">{placeholder}</span>
      <span class="w-0.5 h-5 bg-primary ml-0.5 animate-pulse"></span>
    {/if}
  </div>

  <!-- Key grid -->
  <div class="flex flex-col gap-1 mb-6">
    {#each currentKeys as row, rowIdx}
      <div class="flex gap-1 justify-center">
        {#each row as key, colIdx}
          <div
            class="w-10 h-10 flex items-center justify-center rounded text-sm font-mono transition-all
              {rowIdx === cursorRow && colIdx === cursorCol
                ? 'bg-primary text-black font-bold border border-primary shadow-[0_0_10px_rgba(13,242,242,0.4)]'
                : 'bg-slate-800 text-slate-300 border border-slate-700'}"
          >
            {key}
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <!-- Bottom hints -->
  <div class="flex items-center gap-6 text-[10px] text-slate-500 font-mono">
    <div class="flex items-center gap-1.5">
      <span class="px-1.5 py-0.5 rounded border {symbolMode ? 'bg-secondary/20 text-secondary border-secondary/30' : 'bg-slate-800 text-slate-400 border-slate-700'}">X</span>
      <span>{symbolMode ? 'SYM' : 'Symbols'}</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">A</span>
      <span>Type</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">B</span>
      <span>Backspace</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Y</span>
      <span>Done</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">START</span>
      <span>Cancel</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">RB</span>
      <span>Paste</span>
    </div>
  </div>
</div>
