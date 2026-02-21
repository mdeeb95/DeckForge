<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, type UserData, type AuditEntry } from '../api';
  import StatCard from './StatCard.svelte';
  import StatusBadge from './StatusBadge.svelte';

  let stats = $state({ total_users: 0, active_users: 0, total_invites: 0, total_predictions: 0 });
  let recentUsers: UserData[] = $state([]);
  let auditLog: AuditEntry[] = $state([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const [s, u, a] = await Promise.all([
        adminApi.getStats(),
        adminApi.getRecentUsers(),
        adminApi.getAuditLog(),
      ]);
      stats = s;
      recentUsers = u;
      auditLog = a;
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      loading = false;
    }
  });

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
</script>

{#if loading}
  <div class="flex items-center justify-center h-64 text-gray-400">Loading...</div>
{:else}
  <div class="p-6 space-y-6">
    <!-- Stats Row -->
    <div class="flex gap-4 flex-wrap">
      <StatCard label="Total Users" value={stats.total_users} />
      <StatCard label="Active Users" value={stats.active_users} />
      <StatCard label="Invite Codes" value={stats.total_invites} />
      <StatCard label="Predictions" value={stats.total_predictions} />
    </div>

    <!-- Recent Activity -->
    <div>
      <h2 class="text-lg font-display font-semibold text-white mb-3">Recent Activity</h2>
      <div class="bg-surface-dark border border-surface-border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-border text-gray-400 text-left">
              <th class="px-4 py-3">User</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {#each recentUsers as user}
              <tr class="border-b border-surface-border/50 hover:bg-surface-dark/80">
                <td class="px-4 py-3 text-white">{user.display_name || '—'}</td>
                <td class="px-4 py-3 text-gray-300">{user.email || '—'}</td>
                <td class="px-4 py-3">
                  <StatusBadge status={user.is_active ? 'active' : 'inactive'} />
                </td>
                <td class="px-4 py-3 text-gray-400">{formatDate(user.last_seen_at)}</td>
              </tr>
            {/each}
            {#if recentUsers.length === 0}
              <tr>
                <td colspan="4" class="px-4 py-8 text-center text-gray-500">No users yet</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Admin Actions -->
    <div>
      <h2 class="text-lg font-display font-semibold text-white mb-3">Admin Actions</h2>
      <div class="bg-surface-dark border border-surface-border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-border text-gray-400 text-left">
              <th class="px-4 py-3">Action</th>
              <th class="px-4 py-3">Target</th>
              <th class="px-4 py-3">Details</th>
              <th class="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {#each auditLog as entry}
              <tr class="border-b border-surface-border/50 hover:bg-surface-dark/80">
                <td class="px-4 py-3 text-white">{formatAction(entry.action)}</td>
                <td class="px-4 py-3 text-gray-300">{entry.target_type}: {entry.target_id.slice(0, 8)}...</td>
                <td class="px-4 py-3 text-gray-400">{entry.details || '—'}</td>
                <td class="px-4 py-3 text-gray-400">{formatDate(entry.created_at)}</td>
              </tr>
            {/each}
            {#if auditLog.length === 0}
              <tr>
                <td colspan="4" class="px-4 py-8 text-center text-gray-500">No admin actions yet</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
