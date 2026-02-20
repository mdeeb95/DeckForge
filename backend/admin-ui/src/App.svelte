<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi } from './lib/api';
  import Login from './lib/components/Login.svelte';
  import Nav from './lib/components/Nav.svelte';
  import Dashboard from './lib/components/Dashboard.svelte';
  import Users from './lib/components/Users.svelte';
  import Invites from './lib/components/Invites.svelte';

  let authenticated = $state(false);
  let checking = $state(true);
  let route = $state(window.location.hash || '#/dashboard');

  onMount(() => {
    // Check existing session
    adminApi.checkSession()
      .then(() => { authenticated = true; })
      .catch(() => { authenticated = false; })
      .finally(() => { checking = false; });

    // Listen for hash changes
    const onHash = () => { route = window.location.hash || '#/dashboard'; };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  function handleAuthenticated() {
    authenticated = true;
    window.location.hash = '#/dashboard';
    route = '#/dashboard';
  }

  function handleLogout() {
    authenticated = false;
    window.location.hash = '#/login';
    route = '#/login';
  }
</script>

{#if checking}
  <div class="min-h-screen flex items-center justify-center bg-background-dark text-gray-400">
    Loading...
  </div>
{:else if !authenticated}
  <Login onauthenticated={handleAuthenticated} />
{:else}
  <Nav currentRoute={route} onlogout={handleLogout} />

  {#if route === '#/users'}
    <Users />
  {:else if route === '#/invites'}
    <Invites />
  {:else}
    <Dashboard />
  {/if}
{/if}
