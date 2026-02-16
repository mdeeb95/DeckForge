<script lang="ts">
  import { screenshotFlash } from '../stores/screenshot';

  function onAnimationEnd() {
    screenshotFlash.set(false);
  }
</script>

<svelte:head>
  <style>
    @keyframes screenshot-flash {
      0% { opacity: 0.3; }
      100% { opacity: 0; }
    }
  </style>
</svelte:head>

{#if $screenshotFlash}
  <div
    class="fixed inset-0 z-50 pointer-events-none bg-white"
    style="animation: screenshot-flash 200ms ease-out forwards;"
    on:animationend={onAnimationEnd}
  ></div>
{/if}
