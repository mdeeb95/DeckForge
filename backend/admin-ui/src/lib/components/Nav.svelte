<script lang="ts">
  import { adminApi } from '../api';

  let { currentRoute = '#/dashboard', onlogout }: { currentRoute?: string; onlogout: () => void } = $props();

  function isActive(route: string): string {
    return currentRoute === route ? 'text-primary' : 'text-gray-400 hover:text-gray-200';
  }

  async function handleLogout() {
    await adminApi.logout();
    onlogout();
  }
</script>

<nav class="bg-surface-dark border-b border-surface-border px-6 py-3 flex items-center justify-between">
  <div class="flex items-center gap-8">
    <span class="text-white font-display font-bold text-lg tracking-wide">
      DECKFORGE <span class="text-primary">ADMIN</span>
    </span>

    <div class="flex gap-6 text-sm font-medium">
      <a href="#/dashboard" class="{isActive('#/dashboard')} transition-colors">Dashboard</a>
      <a href="#/users" class="{isActive('#/users')} transition-colors">Users</a>
      <a href="#/invites" class="{isActive('#/invites')} transition-colors">Invites</a>
    </div>
  </div>

  <button
    onclick={handleLogout}
    class="text-gray-400 hover:text-red-400 text-sm transition-colors"
  >
    Logout
  </button>
</nav>
