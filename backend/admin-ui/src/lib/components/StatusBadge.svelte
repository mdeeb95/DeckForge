<script lang="ts">
  let { status }: { status: 'active' | 'inactive' | 'depleted' | 'expired' | 'disabled' } = $props();

  const colorMap: Record<string, string> = {
    active: 'bg-green-900/40 text-green-400 border-green-700',
    inactive: 'bg-red-900/40 text-red-400 border-red-700',
    depleted: 'bg-yellow-900/40 text-yellow-400 border-yellow-700',
    expired: 'bg-red-900/40 text-red-400 border-red-700',
    disabled: 'bg-gray-800/40 text-gray-400 border-gray-600',
  };
</script>

<span class="inline-block px-2 py-0.5 text-xs font-medium uppercase border rounded-full {colorMap[status] || colorMap.disabled}">
  {status}
</span>
