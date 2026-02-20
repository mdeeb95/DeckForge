<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, type InviteData } from '../api';
  import StatusBadge from './StatusBadge.svelte';

  let invites: InviteData[] = $state([]);
  let loading = $state(true);

  // Generate form
  let genCount = $state(1);
  let genMaxUses = $state(1);
  let genNote = $state('');
  let generating = $state(false);

  // Copy feedback
  let copiedId = $state('');

  onMount(async () => {
    try {
      invites = await adminApi.getInvites();
    } catch (err) {
      console.error('Failed to load invites:', err);
    } finally {
      loading = false;
    }
  });

  async function handleGenerate() {
    generating = true;
    try {
      const created = await adminApi.generateInvites(genCount, genMaxUses, genNote);
      invites = [...created, ...invites];
      genNote = '';
    } catch (err) {
      console.error('Failed to generate:', err);
    } finally {
      generating = false;
    }
  }

  async function toggleActive(invite: InviteData) {
    try {
      const updated = await adminApi.toggleInviteActive(invite.id);
      invites = invites.map(i => i.id === updated.id ? updated : i);
    } catch (err) {
      console.error('Failed to toggle invite:', err);
    }
  }

  async function copyCode(invite: InviteData) {
    await navigator.clipboard.writeText(invite.code);
    copiedId = invite.id;
    setTimeout(() => { if (copiedId === invite.id) copiedId = ''; }, 1500);
  }

  function getInviteStatus(invite: InviteData): 'active' | 'disabled' | 'depleted' | 'expired' {
    if (!invite.is_active) return 'disabled';
    if (invite.times_used >= invite.max_uses) return 'depleted';
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) return 'expired';
    return 'active';
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="p-6 space-y-6">
  <!-- Generate Card -->
  <div class="bg-surface-dark border border-surface-border rounded-lg p-5">
    <h2 class="text-lg font-display font-semibold text-white mb-4">Generate Codes</h2>
    <div class="flex gap-4 items-end flex-wrap">
      <div>
        <label class="block text-xs text-gray-400 mb-1" for="gen-count">Count</label>
        <input
          id="gen-count"
          type="number"
          min="1"
          max="50"
          bind:value={genCount}
          class="w-20 bg-background-dark border border-surface-border rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1" for="gen-uses">Max Uses</label>
        <input
          id="gen-uses"
          type="number"
          min="1"
          max="1000"
          bind:value={genMaxUses}
          class="w-20 bg-background-dark border border-surface-border rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <div class="flex-1 min-w-[200px]">
        <label class="block text-xs text-gray-400 mb-1" for="gen-note">Note</label>
        <input
          id="gen-note"
          type="text"
          bind:value={genNote}
          placeholder="e.g. beta testers batch 1"
          class="w-full bg-background-dark border border-surface-border rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
        />
      </div>
      <button
        onclick={handleGenerate}
        disabled={generating}
        class="bg-primary text-background-dark font-semibold px-4 py-1.5 rounded text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {generating ? 'Generating...' : 'Generate'}
      </button>
    </div>
  </div>

  <!-- Invites Table -->
  <div>
    <h2 class="text-lg font-display font-semibold text-white mb-3">All Invite Codes</h2>

    {#if loading}
      <div class="flex items-center justify-center h-32 text-gray-400">Loading...</div>
    {:else}
      <div class="bg-surface-dark border border-surface-border rounded-lg overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-border text-gray-400 text-left">
              <th class="px-4 py-3">Code</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Uses</th>
              <th class="px-4 py-3">Note</th>
              <th class="px-4 py-3">Created</th>
              <th class="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each invites as invite}
              <tr class="border-b border-surface-border/50 hover:bg-background-dark/30">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-lg text-white font-medium tracking-wider">{invite.code}</span>
                    <button
                      onclick={() => copyCode(invite)}
                      class="text-gray-500 hover:text-primary transition-colors text-xs"
                      title="Copy code"
                    >
                      {copiedId === invite.id ? '✓' : '⧉'}
                    </button>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <StatusBadge status={getInviteStatus(invite)} />
                </td>
                <td class="px-4 py-3 text-gray-300 font-mono">{invite.times_used}/{invite.max_uses}</td>
                <td class="px-4 py-3 text-gray-400">{invite.note || '—'}</td>
                <td class="px-4 py-3 text-gray-400">{formatDate(invite.created_at)}</td>
                <td class="px-4 py-3">
                  <button
                    onclick={() => toggleActive(invite)}
                    class="px-2 py-1 text-xs rounded border transition-colors {invite.is_active
                      ? 'border-yellow-700 text-yellow-400 hover:bg-yellow-900/30'
                      : 'border-green-700 text-green-400 hover:bg-green-900/30'}"
                  >
                    {invite.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            {/each}
            {#if invites.length === 0}
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">No invite codes yet</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
