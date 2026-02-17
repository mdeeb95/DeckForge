<script lang="ts">
  interface Props {
    button: string;
    label: string;
    icon: string;
    variant?: 'default' | 'emerald';
  }

  let { button, label, icon, variant = 'default' }: Props = $props();

  const isEmerald = $derived(variant === 'emerald');
</script>

<div class="relative group">
  <div class="bg-[#13171e] border border-dashed {isEmerald ? 'border-emerald-500/30' : 'border-slate-700'} p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
    <div class="flex items-center gap-3">
      <div class="{isEmerald ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-300 border-slate-600'} px-1.5 py-0.5 rounded text-[10px] font-bold border">{button}</div>
      <span class="text-xs {isEmerald ? 'text-emerald-300' : 'text-slate-300'} font-medium">{label}</span>
    </div>
    <span class="material-icons text-sm {isEmerald ? 'text-emerald-400' : 'text-slate-500'}">{icon}</span>
  </div>
</div>
