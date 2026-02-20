<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards, sessionCostUsd } from '../stores/app';
  import { cost } from '../stores/terminal';
  import { sessionStartTime, sessionPromptCount, sessionScreenshotCount, sessionRerollCount, resetSession } from '../stores/session';
  import { autoFixAttempt } from '../system/autoFix';
  import { getTimeline } from '../history/timeline';
  import { playNav, playSuccess, playClick, playError } from '../audio/sfx';

  // ─── Stat data ──────────────────────────────────────────────────────────────

  interface StatRow {
    label: string;
    value: number;
    format?: (n: number) => string;
    color?: string;
    paired?: boolean; // appears side-by-side with next stat
  }

  let stats = $state<StatRow[]>([]);
  let visibleCount = $state(0);
  let displayValues = $state<number[]>([]);
  let titleText = $state('');
  let titleVisible = $state(false);
  let elapsed = $state('');
  let headerVisible = $state(false);
  let costValue = $state(0);
  let glitchActive = $state(false);

  // ─── Gather stats on mount ────────────────────────────────────────────────

  onMount(async () => {
    const startTime = get(sessionStartTime);
    const diffMs = Date.now() - startTime.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    elapsed = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const prompts = get(sessionPromptCount);
    const screenshots = get(sessionScreenshotCount);
    const rerolls = get(sessionRerollCount);
    const autoFixes = get(autoFixAttempt);
    costValue = get(sessionCostUsd);

    // Gather git stats — try to get timeline commits since session start
    let commits = 0;
    let filesChanged = 0;
    let linesAdded = 0;
    let linesDeleted = 0;

    try {
      const timeline = await getTimeline('.');
      const sessionEntries = timeline.filter(e => new Date(e.timestamp) >= startTime);
      commits = sessionEntries.length;
      filesChanged = sessionEntries.reduce((sum, e) => sum + e.files_changed, 0);
      linesAdded = sessionEntries.reduce((sum, e) => sum + e.insertions, 0);
      linesDeleted = sessionEntries.reduce((sum, e) => sum + e.deletions, 0);
    } catch {
      // Git unavailable — use zeros
    }

    stats = [
      { label: 'COMMITS SHIPPED', value: commits, color: '#0df2f2' },
      { label: 'FILES CHANGED', value: filesChanged },
      { label: 'LINES ADDED', value: linesAdded, format: n => `+${n}`, color: '#3fb950', paired: true },
      { label: 'LINES DELETED', value: linesDeleted, format: n => `-${n}`, color: '#f85149' },
      { label: 'PROMPTS FIRED', value: prompts },
      { label: 'API COST', value: costValue, format: n => `$${n.toFixed(2)}`, color: '#f59e0b' },
      { label: 'REROLLS USED', value: rerolls },
      { label: 'AUTO-FIXES', value: autoFixes },
      { label: 'SCREENSHOTS', value: screenshots },
    ];

    displayValues = stats.map(() => 0);

    // Determine title
    if (commits === 0 && prompts > 5) titleText = 'Professional Overthinker';
    else if (linesDeleted > linesAdded) titleText = 'Digital Demolition Expert';
    else if (autoFixes > 3) titleText = 'Crash Test Dummy';
    else if (costValue > 5.0) titleText = "Anthropic's Favorite Customer";
    else if (commits > 10) titleText = 'Commit Machine';
    else if (rerolls > 5) titleText = 'Indecisive but Thorough';
    else if (screenshots > 5) titleText = 'Documentation Enthusiast';
    else if (diffMs > 4 * 3600000) titleText = 'Endurance Runner';
    else if (linesAdded > 500) titleText = 'Code Volcano';
    else titleText = 'Shipped It';

    // Start the reveal sequence
    headerVisible = true;

    // Stagger stat reveals
    for (let i = 0; i < stats.length; i++) {
      await delay(400);
      visibleCount = i + 1;
      playNav();
      animateCounter(i, stats[i].value, 600);
    }

    // Pause, then reveal title
    await delay(800);
    titleVisible = true;
    playSuccess();
  });

  // ─── Action palette cards ──────────────────────────────────────────────────

  function handleContinue() {
    playClick();
    navigate('level1');
  }

  function handleNewSession() {
    playClick();
    resetSession();
    navigate('level1');
  }

  function handleOneMoreRun() {
    playError(); // dramatic sound — Y is always ridiculous
    glitchActive = true;
    setTimeout(() => {
      glitchActive = false;
      navigate('level1');
    }, 800);
  }

  const cards = [
    {
      title: 'Continue',
      description: 'Back to the action',
      pills: [{ label: 'GO', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: handleContinue,
    },
    {
      button: 'B',
      title: 'New Session',
      description: 'Reset all counters, fresh start',
      pills: [{ label: 'RESET', variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: handleNewSession,
    },
    {
      button: 'Y',
      title: 'One More Run',
      description: 'You said that 3 runs ago',
      pills: [{ label: 'YOLO', variant: 'neutral' as const }],
      variant: 'amber' as const,
      onclick: handleOneMoreRun,
    },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));

  // ─── Counter animation (easeOutExpo via rAF) ──────────────────────────────

  function easeOutExpo(t: number): number {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function animateCounter(index: number, target: number, duration: number) {
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeOutExpo(progress);
      displayValues[index] = Math.round(eased * target * 100) / 100;
      displayValues = displayValues; // trigger reactivity
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── MTX easter egg ────────────────────────────────────────────────────────

  function getMtxText(): string {
    if (costValue > 1.0) return 'Premium Vibes Unlocked';
    return 'F2P BTW';
  }

  function formatValue(stat: StatRow, val: number): string {
    if (stat.format) return stat.format(val);
    return Math.round(val).toString();
  }
</script>

<!-- Left panel: Stats display -->
<div class="flex-1 min-w-0 bg-[#0d1117] flex flex-col items-center justify-center p-6 relative overflow-hidden">

  {#if glitchActive}
    <div class="absolute inset-0 bg-primary/5 animate-pulse z-10 pointer-events-none"></div>
  {/if}

  <!-- Header -->
  <div class="text-center mb-6 transition-all duration-500 {headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}">
    <h1 class="text-2xl font-display font-bold tracking-wider" style="color: #0df2f2; text-shadow: 0 0 20px rgba(13,242,242,0.4);">SESSION COMPLETE</h1>
    <p class="text-sm text-slate-400 mt-1 font-mono">{elapsed}</p>
  </div>

  <!-- Stats grid -->
  <div class="w-full max-w-[560px] grid grid-cols-2 gap-x-6 gap-y-3">
    {#each stats as stat, i}
      {#if i < visibleCount}
        <div class="transition-all duration-300 {stat.paired ? '' : (i > 0 && stats[i-1]?.paired ? '' : 'col-span-2')}"
             class:col-span-1={stat.paired || (i > 0 && stats[i-1]?.paired)}
             style="animation: fadeSlideIn 300ms ease-out;">
          <div class="flex items-baseline justify-between py-1.5 px-3 rounded bg-[#161b22]/60">
            <span class="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{stat.label}</span>
            <span class="text-xl font-bold font-mono tabular-nums" style="color: {stat.color || '#e2e8f0'}">
              {formatValue(stat, displayValues[i])}
            </span>
          </div>
          <!-- MTX easter egg on cost row -->
          {#if stat.label === 'API COST' && displayValues[i] === costValue && visibleCount > i}
            <div class="text-[8px] text-slate-600 font-mono text-right pr-3 mt-0.5">
              {#if costValue > 1.0}<span>&#x1F48E;</span>{/if} {getMtxText()}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <!-- Title reveal -->
  {#if titleVisible}
    <div class="mt-8 text-center transition-all duration-300 {glitchActive ? 'animate-pulse scale-110' : ''}"
         style="animation: titleReveal 300ms cubic-bezier(0.34, 1.56, 0.64, 1);">
      <p class="text-lg font-display font-bold tracking-wide" style="color: #0df2f2; text-shadow: 0 0 16px rgba(13,242,242,0.5);">
        "{titleText}"
      </p>
    </div>
  {/if}
</div>

<!-- Right panel: ActionPalette -->
<ActionPalette
  breadcrumb="Session"
  step={0}
  title="Results"
  subtitle="How'd you do?"
  {cards}
  selectedIndex={$selectedCardIndex}
  hints={[
    { key: 'A', label: 'Continue' },
    { key: 'B', label: 'New Session' },
    { key: 'Y', label: 'One More Run' },
  ]}
/>

<style>
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes titleReveal {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
