<script lang="ts">
  interface Props {
    button: string;
    label: string;
    icon: string;
  }

  let { button, label, icon }: Props = $props();
</script>

<div class="relative group">
  <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
    <div class="flex items-center gap-3">
      <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">{button}</div>
      <span class="text-xs text-slate-300 font-medium">{label}</span>
    </div>
    <span class="material-icons text-slate-500 text-sm">{icon}</span>
  </div>
</div>
