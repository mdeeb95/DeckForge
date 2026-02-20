<script lang="ts">
  import { adminApi } from '../api';

  let { onauthenticated }: { onauthenticated: () => void } = $props();

  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await adminApi.login(password);
      onauthenticated();
    } catch (err: any) {
      error = err.message || 'Login failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-background-dark">
  <div class="bg-surface-dark border border-surface-border rounded-lg p-8 w-full max-w-sm">
    <h1 class="text-2xl font-display font-bold text-white mb-1">DeckForge</h1>
    <p class="text-gray-400 text-sm mb-6">Admin Panel</p>

    <form onsubmit={handleSubmit}>
      <label class="block text-sm text-gray-400 mb-2" for="password">Password</label>
      <input
        id="password"
        type="password"
        bind:value={password}
        class="w-full bg-background-dark border border-surface-border rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-primary transition-colors"
        placeholder="Enter admin password"
        required
      />

      <button
        type="submit"
        disabled={loading}
        class="w-full mt-4 bg-primary text-background-dark font-semibold py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      {#if error}
        <p class="text-red-400 text-sm mt-3">{error}</p>
      {/if}
    </form>
  </div>
</div>
