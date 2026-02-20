<script lang="ts">
  let { label, value, icon = '' }: { label: string; value: number; icon?: string } = $props();
</script>

<div class="bg-surface-dark border border-surface-border rounded-lg p-5 flex-1 min-w-[180px]">
  {#if icon}
    <div class="text-gray-500 text-sm mb-1">{icon}</div>
  {/if}
  <div class="text-3xl font-bold text-primary font-mono">{value.toLocaleString()}</div>
  <div class="text-gray-400 text-sm mt-1">{label}</div>
</div>
