<script lang="ts">
  interface Props {
    title: string;
    icon: string;
  }

  let { title, icon }: Props = $props();
</script>

<div class="settings-section">
  <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {@html icon}
  </svg>
  <span class="section-title">{title}</span>
  <div class="section-line"></div>
</div>

<style>
  .settings-section {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 0 8px;
  }
  .settings-section:first-child {
    padding-top: 12px;
  }
  .section-icon {
    width: 16px;
    height: 16px;
    color: #0df2f2;
    opacity: 0.7;
  }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #0df2f2;
    opacity: 0.7;
  }
  .section-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, #30363d, transparent);
  }
</style>
