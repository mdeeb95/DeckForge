<script lang="ts">
  import { selectedCardIndex, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { lastScreenshotPath, lastScreenshotMeta } from '../stores/screenshot';
  import { startListening } from '../system/voice';
  import { glyph } from '../input/inputMode.svelte';

  const cards = [
    { action: 'send', title: 'Send to Claude', description: 'Send this screenshot path to Claude Code as context for the current task.', pill: 'Context' },
    { action: 'discard', title: 'Discard', description: 'Delete the screenshot and return to the previous screen.', pill: 'Delete' },
    { action: 'voice', button: 'X', title: 'Voice Annotate', description: 'Record a voice note describing this screenshot for richer context.', pill: 'Annotate' },
    { action: 'new_task', button: 'Y', title: 'Send + New Task', description: 'Send screenshot to context AND start a new task based on it.', pill: 'Task' },
  ];

  screenCards.set(cards.map(c => ({
    ...(c.button ? { button: c.button } : {}),
    title: c.title,
    description: c.description,
    onclick: () => handleAction(c.action),
  })));

  function handleAction(action: string) {
    const path = $lastScreenshotPath;
    switch (action) {
      case 'send':
        if (path) {
          pendingClaudePrompt.set(`[Screenshot attached: ${path}]`);
        }
        navigate('level1');
        break;
      case 'discard':
        // Discard — in production would delete the file
        console.log('[screenshot-feedback] Discarding screenshot:', path);
        navigate('level1');
        break;
      case 'voice':
        startListening();
        navigate('voice_pitch');
        break;
      case 'new_task':
        if (path) {
          pendingClaudePrompt.set(`[Screenshot: ${path}] Analyze this screenshot and suggest a task.`);
        }
        navigate('ai_working');
        break;
    }
  }

  // Extract filename from path for display
  $: filename = $lastScreenshotPath?.split('/').pop() ?? 'screenshot.png';
</script>

<div class="flex-1 overflow-hidden bg-background-dark">
<div class="h-full flex flex-col items-center justify-center relative">
  <!-- Header -->
  <div class="text-center mb-6">
    <h1 class="text-xs font-bold text-primary uppercase tracking-widest mb-1">Screenshot Captured</h1>
    <p class="text-xs text-slate-500">Choose what to do with the capture</p>
  </div>

  <!-- Screenshot Preview -->
  <div class="bg-surface-dark border border-surface-border rounded p-4 max-w-lg mx-auto mb-6 flex items-center gap-3">
    <div class="w-10 h-10 bg-primary/10 border border-primary/20 rounded flex items-center justify-center flex-shrink-0">
      <span class="material-icons text-primary text-lg">photo_camera</span>
    </div>
    <div class="min-w-0">
      <div class="text-sm text-slate-200 font-mono truncate">{filename}</div>
      {#if $lastScreenshotMeta}
        <div class="text-[10px] text-slate-500 font-mono">
          Session #{$lastScreenshotMeta.session_number} &middot; {new Date($lastScreenshotMeta.captured_at).toLocaleTimeString()}
        </div>
      {/if}
    </div>
  </div>

  <!-- Action Cards -->
  <div class="flex flex-col gap-2 max-w-lg mx-auto w-full px-4">
    {#each cards as card, i}
      {#if i === $selectedCardIndex}
        <!-- Selected card -->
        <div class="relative group cursor-pointer">
          <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
          <div class="bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
            <h3 class="text-primary font-bold text-sm mb-1 truncate">{card.title}</h3>
            <p class="text-xs text-slate-300 leading-snug mb-2">{card.description}</p>
            <div class="flex items-center gap-2 text-[10px]">
              <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{card.pill}</span>
            </div>
          </div>
        </div>
      {:else}
        <!-- Unselected card -->
        <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
          <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative">
            <h3 class="text-white font-medium text-sm mb-1 truncate">{card.title}</h3>
            <p class="text-xs text-slate-400 leading-snug mb-2">{card.description}</p>
            <div class="flex items-center gap-2 text-[10px]">
              <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">{card.pill}</span>
            </div>
          </div>
        </div>
      {/if}
    {/each}

    <!-- Separator -->
    <div class="h-px bg-surface-border my-1"></div>

    <!-- Secondary: LB = Back -->
    <div class="relative group">
      <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">{glyph('LB')}</div>
          <span class="text-xs text-slate-300 font-medium">Back</span>
        </div>
        <span class="material-icons text-slate-500 text-sm">arrow_back</span>
      </div>
    </div>
  </div>
</div>
</div>
