<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    description: string;
    focused: boolean;
    staggerDelay: string;
    children?: Snippet;
  }

  let { label, description, focused, staggerDelay, children }: Props = $props();
</script>

<div
  class="setting-row"
  class:focused
  data-setting-row
  style="animation-delay: {staggerDelay}"
>
  <div class="setting-left">
    <div class="setting-label">{label}</div>
    <div class="setting-desc">{description}</div>
  </div>
  <div class="setting-right">
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-left: 1px solid #30363d;
    border-radius: 4px;
    cursor: default;
    margin-bottom: 4px;
    opacity: 0;
    transform: translateY(10px);
    animation: rowIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
    transition:
      transform 0.2s cubic-bezier(0.16,1,0.3,1),
      padding-left 0.58s cubic-bezier(0.22,1,0.36,1),
      border-color 0.33s ease,
      border-left-width 0.58s cubic-bezier(0.22,1,0.36,1),
      border-left-color 0.58s cubic-bezier(0.22,1,0.36,1),
      box-shadow 0.33s ease,
      background 0.33s ease;
    transform-origin: center center;
    position: relative;
    overflow: hidden;
  }

  .setting-row.focused {
    border-color: #0df2f2;
    border-left: 2px solid #0df2f2;
    padding-left: 21px;
    transform: scale(1.015);
    transition:
      transform 0.2s cubic-bezier(0.16,1,0.3,1),
      padding-left 0.58s cubic-bezier(0.22,1,0.36,1),
      border-color 0.25s ease,
      border-left-width 0.58s cubic-bezier(0.22,1,0.36,1),
      border-left-color 0.58s cubic-bezier(0.22,1,0.36,1),
      box-shadow 0.25s ease,
      background 0.25s ease;
    box-shadow:
      -2px 0 18px rgba(13,242,242,0.25),
      0 0px 9px rgba(13,242,242,0.1),
      0 0 16px rgba(13,242,242,0.8),
      inset 0 0 0 1px rgba(13,242,242,0);
    background: rgba(13,242,242,0.08);
    z-index: 2;
  }

  @keyframes rowIn {
    to { opacity: 1; transform: translateY(0); }
  }

  .setting-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .setting-label {
    font-size: 13px;
    font-weight: 600;
    color: #e6edf3;
    transition: color 0.25s ease;
  }

  .setting-row.focused .setting-label {
    color: #0df2f2;
  }

  .setting-desc {
    font-size: 11px;
    color: #484f58;
    font-family: 'JetBrains Mono', monospace;
  }

  .setting-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
