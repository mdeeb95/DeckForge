<script lang="ts">
  import { handleInput } from '../input/inputRouter';
  import { playClick } from '../audio/sfx';
  import { glyph } from '../input/inputMode.svelte';

  interface Props {
    button: string;
    label: string;
    icon: string;
    variant?: 'default' | 'emerald';
    onclick?: () => void;
  }

  let { button, label, icon, variant = 'default', onclick }: Props = $props();

  const isEmerald = $derived(variant === 'emerald');

  function handleClick() {
    playClick();
    if (onclick) {
      onclick();
    } else {
      handleInput(button);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative group" onclick={handleClick}>
  <div class="bg-[#13171e] border border-dashed {isEmerald ? 'border-emerald-500/30 hover:border-solid hover:border-emerald-500/50 hover:bg-[#1a1e24]' : 'border-slate-700 hover:border-solid hover:border-slate-500 hover:bg-[#1a1e24]'} p-2 rounded flex items-center justify-between transition-all duration-150 cursor-pointer">
    <div class="flex items-center gap-3">
      <div class="{isEmerald ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-300 border-slate-600'} px-1.5 py-0.5 rounded text-[10px] font-bold border">{glyph(button)}</div>
      <span class="text-xs {isEmerald ? 'text-emerald-300 group-hover:text-emerald-200' : 'text-slate-300 group-hover:text-slate-200'} font-medium">{label}</span>
    </div>
    <span class="material-icons text-sm {isEmerald ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-slate-500 group-hover:text-slate-300'}">{icon}</span>
  </div>
</div>
