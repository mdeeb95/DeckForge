<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import { selectedCardIndex, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { sendPrompt, onOutput, interrupt, getSessionState } from '../claude/subprocess';
  import { parseClaudeEvent, extractCost, extractScope } from '../claude/streamParser';
  import { projectConfig } from '../stores/configStores';
  import type { ClaudeEvent } from '../claude/types';
  import { getRandomMessage } from '../personality/messages';

  let taskComplete = $state(false);
  let taskFailed = $state(false);
  let elapsedSeconds = $state(0);
  let toolEvents = $state<ClaudeEvent[]>([]);
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;
  let workingMessage = $state(getRandomMessage('ai_working'));
  let messageInterval: ReturnType<typeof setInterval> | null = null;

  function handleInterrupt() {
    interrupt();
    navigate('level1');
  }

  function handleContinue() {
    navigate('qa_mode');
  }

  const cards = [
    {
      button: 'B',
      title: 'Interrupt',
      description: 'Stop Claude Code and revert to last checkpoint.',
      pills: [{ label: 'Cancel', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: handleInterrupt,
    },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));

  onMount(() => {
    entries.clear();
    status.set('streaming');
    cost.set('$0.00');
    scope.set('');
    taskComplete = false;
    taskFailed = false;
    elapsedSeconds = 0;
    toolEvents = [];

    // Start elapsed timer
    elapsedInterval = setInterval(() => {
      elapsedSeconds += 1;
    }, 1000);

    // Cycle quirky working messages every 8 seconds
    messageInterval = setInterval(() => {
      if (!taskComplete && !taskFailed) {
        workingMessage = getRandomMessage('ai_working');
      }
    }, 8000);

    // Register output handler
    onOutput((event: ClaudeEvent) => {
      const terminalEntries = parseClaudeEvent(event);
      for (const entry of terminalEntries) {
        entries.addEntry(entry);
      }

      // Track tool events for scope calculation
      if (event.type === 'tool_use' || event.type === 'tool_result') {
        toolEvents = [...toolEvents, event];
        scope.set(extractScope(toolEvents));
      }

      // Handle completion
      if (event.type === 'result') {
        cost.set(extractCost(event));
        status.set(event.is_error ? 'error' : 'complete');
        taskComplete = !event.is_error;
        taskFailed = event.is_error;

        if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
        if (messageInterval) { clearInterval(messageInterval); messageInterval = null; }

        // Update screenCards to show continue option
        if (!event.is_error) {
          screenCards.set([
            {
              button: 'A',
              title: 'Continue',
              description: 'Task complete. Proceed to QA review.',
              onclick: handleContinue,
            },
            {
              button: 'B',
              title: 'Back to Home',
              description: 'Return to the main screen.',
              onclick: () => navigate('level1'),
            },
          ]);
        }
      }
    });

    // Consume pending prompt
    const prompt = get(pendingClaudePrompt);
    if (prompt) {
      pendingClaudePrompt.set(null);

      entries.addEntry({
        type: 'prompt',
        label: 'TASK',
        body: prompt,
      });

      // Build session options from project config
      const config = get(projectConfig);
      const projectPath = config?.project.path ?? '.';
      const sessionId = config?.claude_code.session_id ?? undefined;

      sendPrompt(prompt, {
        projectPath,
        systemPromptAppend: 'The user strongly prefers not to type — handle everything yourself. They CAN use a keyboard but it\'s a last resort. Provide clear progress updates. This project is controlled via a gamepad interface. Auto-commit after completing each task with a descriptive message.',
        permissionMode: 'acceptEdits',
        allowedTools: [
          'Read', 'Write', 'Edit', 'Glob', 'Grep',
          'Bash(git *)', 'Bash(npm *)', 'Bash(npx *)',
          'Bash(python *)', 'Bash(pip *)', 'Bash(cargo *)',
          'Bash(make *)',
        ],
        sessionId,
      });
    } else {
      // No pending prompt — show idle state
      entries.addEntry({
        type: 'cursor',
        message: 'No task pending. Press B to go back.',
      });
      status.set('idle');
      if (elapsedInterval) {
        clearInterval(elapsedInterval);
        elapsedInterval = null;
      }
    }
  });

  onDestroy(() => {
    if (elapsedInterval) clearInterval(elapsedInterval);
    if (messageInterval) clearInterval(messageInterval);
  });

  function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }
</script>

<TerminalPanel />
<aside class="flex-1 min-w-[280px] bg-surface-dark border-l border-surface-border flex flex-col z-20 shadow-2xl">
  <div class="p-3 border-b border-surface-border bg-surface-dark">
    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">AI Working</h2>
    <p class="text-[10px] text-slate-600">
      {#if taskComplete}
        {getRandomMessage('success')}
      {:else if taskFailed}
        {getRandomMessage('error')}
      {:else}
        {workingMessage}
      {/if}
    </p>
  </div>

  <div class="flex-1 overflow-hidden min-h-0 p-3">
    <!-- Status indicator -->
    <div class="mb-4">
      {#if taskComplete}
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 flex items-center justify-center rounded-full bg-emerald-400/20 border-2 border-emerald-400 text-emerald-400 text-xs font-bold">✓</span>
          <p class="text-sm text-emerald-400 font-bold">Task Complete</p>
        </div>
        <p class="text-[10px] text-slate-500">Press A to continue to QA review</p>
      {:else if taskFailed}
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 flex items-center justify-center rounded-full bg-red-400/20 border-2 border-red-400 text-red-400 text-xs font-bold">✗</span>
          <p class="text-sm text-red-400 font-bold">Task Failed</p>
        </div>
        <p class="text-[10px] text-slate-500">Press B to go back</p>
      {:else}
        <div class="flex items-center gap-2 mb-2">
          <span class="w-6 h-6 flex items-center justify-center rounded-full bg-primary/20 border-2 border-primary text-primary text-xs font-bold animate-pulse">●</span>
          <p class="text-sm text-white font-bold">Working...</p>
        </div>
        <p class="text-[10px] text-slate-500 italic">{workingMessage}</p>
      {/if}
    </div>

    <!-- Progress info -->
    {#if !taskComplete && !taskFailed}
      <div class="mb-4">
        <div class="bg-slate-800 rounded-full h-1.5 mb-2 overflow-hidden">
          <div class="bg-primary rounded-full h-1.5 progress-sweep shadow-[0_0_10px_rgba(13,242,242,0.6)]"></div>
        </div>
        <div class="flex justify-between text-[10px] text-slate-500">
          <span>In progress</span>
          <span>Elapsed {formatElapsed(elapsedSeconds)}</span>
        </div>
      </div>
    {:else}
      <div class="mb-4">
        <div class="flex justify-between text-[10px] text-slate-500">
          <span>{taskComplete ? 'Completed' : 'Failed'}</span>
          <span>Duration {formatElapsed(elapsedSeconds)}</span>
        </div>
      </div>
    {/if}

    <div class="h-px bg-surface-border my-3"></div>

    <!-- Action cards -->
    {#if taskComplete}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity mb-2" onclick={handleContinue}>
        <div class="bg-surface-dark border border-primary/30 hover:border-primary/50 p-3 rounded relative transition-all">
          <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-primary/20 text-primary border border-primary/30 rounded-full font-bold text-[10px]">A</div>
          <h3 class="text-primary font-medium text-sm mb-1 pr-6">Continue</h3>
          <p class="text-xs text-slate-400 leading-snug">Proceed to QA review</p>
        </div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity" onclick={() => navigate('level1')}>
        <div class="bg-surface-dark border border-red-400/30 hover:border-red-400/50 p-3 rounded relative transition-all">
          <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-red-400/20 text-red-400 border border-red-400/30 rounded-full font-bold text-[10px]">B</div>
          <h3 class="text-red-400 font-medium text-sm mb-1 pr-6">Back to Home</h3>
          <p class="text-xs text-slate-400 leading-snug">Return to the main screen</p>
        </div>
      </div>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity" onclick={handleInterrupt}>
        <div class="bg-surface-dark border border-red-400/30 hover:border-red-400/50 p-3 rounded relative transition-all">
          <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-red-400/20 text-red-400 border border-red-400/30 rounded-full font-bold text-[10px]">B</div>
          <h3 class="text-red-400 font-medium text-sm mb-1 pr-6">Interrupt</h3>
          <p class="text-xs text-slate-400 leading-snug">Stop Claude Code and revert to last checkpoint</p>
        </div>
      </div>
    {/if}
  </div>

  <div class="p-2 bg-[#0b0e11] border-t border-surface-border text-center">
    {#if taskComplete}
      <p class="text-[10px] text-slate-500 font-mono">Press <span class="bg-slate-700 text-white px-1 rounded mx-0.5">A</span> to continue</p>
    {:else}
      <p class="text-[10px] text-slate-500 font-mono">Press <span class="bg-slate-700 text-white px-1 rounded mx-0.5">B</span> to interrupt</p>
    {/if}
  </div>
</aside>
