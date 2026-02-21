<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, type UserData } from '../api';
  import StatusBadge from './StatusBadge.svelte';

  let users: UserData[] = $state([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await adminApi.getUsers();
      users = res.items;
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      loading = false;
    }
  });

  async function toggleActive(user: UserData) {
    try {
      const updated = await adminApi.toggleActive(user.id);
      users = users.map(u => u.id === updated.id ? updated : u);
    } catch (err) {
      console.error('Failed to toggle active:', err);
    }
  }

  async function toggleAdmin(user: UserData) {
    try {
      const updated = await adminApi.toggleAdmin(user.id);
      users = users.map(u => u.id === updated.id ? updated : u);
    } catch (err) {
      console.error('Failed to toggle admin:', err);
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<div class="p-6">
  <h2 class="text-lg font-display font-semibold text-white mb-4">Users</h2>

  {#if loading}
    <div class="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  {:else}
    <div class="bg-surface-dark border border-surface-border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-surface-border text-gray-400 text-left">
            <th class="px-4 py-3">Email</th>
            <th class="px-4 py-3">Display Name</th>
            <th class="px-4 py-3">Created</th>
            <th class="px-4 py-3">Last Seen</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Admin</th>
            <th class="px-4 py-3">Invite Code</th>
            <th class="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each users as user}
            <tr class="border-b border-surface-border/50 hover:bg-background-dark/30">
              <td class="px-4 py-3 text-white">{user.email || '—'}</td>
              <td class="px-4 py-3 text-gray-300">{user.display_name || '—'}</td>
              <td class="px-4 py-3 text-gray-400">{formatDate(user.created_at)}</td>
              <td class="px-4 py-3 text-gray-400">{formatDate(user.last_seen_at)}</td>
              <td class="px-4 py-3">
                <StatusBadge status={user.is_active ? 'active' : 'inactive'} />
              </td>
              <td class="px-4 py-3">
                {#if user.is_admin}
                  <span class="text-primary text-xs font-semibold uppercase">Admin</span>
                {/if}
              </td>
              <td class="px-4 py-3 font-mono text-gray-400 text-xs">{user.invite_code_used || '—'}</td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button
                    onclick={() => toggleActive(user)}
                    class="px-2 py-1 text-xs rounded border transition-colors {user.is_active
                      ? 'border-red-700 text-red-400 hover:bg-red-900/30'
                      : 'border-green-700 text-green-400 hover:bg-green-900/30'}"
                  >
                    {user.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onclick={() => toggleAdmin(user)}
                    class="px-2 py-1 text-xs rounded border transition-colors {user.is_admin
                      ? 'border-yellow-700 text-yellow-400 hover:bg-yellow-900/30'
                      : 'border-primary-dim text-primary hover:bg-primary/10'}"
                  >
                    {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
          {#if users.length === 0}
            <tr>
              <td colspan="8" class="px-4 py-8 text-center text-gray-500">No users yet</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</div>
