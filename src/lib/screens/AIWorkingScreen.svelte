<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionCard from '../components/ActionCard.svelte';
  import HintGrid from '../components/HintGrid.svelte';
  import { selectedCardIndex, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { entries, status, cost, scope, activeTab } from '../stores/terminal';
  import { get } from 'svelte/store';
  import { sendPrompt, onOutput, interrupt, getSessionState } from '../claude/subprocess';
  import { parseClaudeEvent, extractCost, extractScope, extractRunningCost } from '../claude/streamParser';
  import { projectConfig } from '../stores/configStores';
  import type { ClaudeEvent, ClaudeSessionReport } from '../claude/types';
  import { getRandomMessage } from '../personality/messages';
  import { reportClaudeSession } from '../prediction/sessionReporter';
  import { currentPlan, lastPlanTraceId, lastTraceId } from '../stores/prediction';

  let abortController: AbortController;
  let taskComplete = $state(false);
  let taskFailed = $state(false);
  let elapsedSeconds = $state(0);
  let toolEvents = $state<ClaudeEvent[]>([]);
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;
  let workingMessage = $state(getRandomMessage('ai_working'));
  let messageInterval: ReturnType<typeof setInterval> | null = null;

  // Animation state for post-completion cards
  let animatingType = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
  let animatingButton = $state<string | null>(null);

  // Session reporting state
  let toolNames = $state<Set<string>>(new Set());
  let filesAffected = $state<Set<string>>(new Set());
  let sessionPrompt = $state('');
  let wasUnhinged = $state(false);
  let startTime = $state(0);

  function handleInterrupt() {
    const config = get(projectConfig);
    const sessionState = getSessionState();
    const traceId = get(lastPlanTraceId) ?? get(lastTraceId) ?? undefined;

    reportClaudeSession({
      session_id: sessionState.sessionId ?? 'unknown',
      prompt: sessionPrompt,
      result: 'Interrupted by user',
      is_error: false,
      was_interrupted: true,
      was_unhinged: wasUnhinged,
      duration_ms: Date.now() - startTime,
      duration_api_ms: 0,
      num_turns: 0,
      cost_usd: 0,
      total_cost_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
      tools_used: [...toolNames],
      files_affected: [...filesAffected],
      project_path: config?.project.path ?? '.',
      prediction_trace_id: traceId,
    });

    interrupt();
    navigate('level1');
  }

  function handleContinue() {
    if (animatingType) return;
    animatingType = 'confirm';
    animatingButton = 'A';
    screenCards.set([]);

    setTimeout(() => {
      animatingType = null;
      animatingButton = null;
      navigate('qa_mode');
    }, 350);
  }

  function handleBackToHome() {
    if (animatingType) return;
    animatingType = 'dismiss';
    animatingButton = 'B';
    screenCards.set([]);

    setTimeout(() => {
      animatingType = null;
      animatingButton = null;
      navigate('level1');
    }, 300);
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
    abortController = new AbortController();
    activeTab.set('claude');
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
      if (abortController.signal.aborted) return; // screen was destroyed
      const terminalEntries = parseClaudeEvent(event);
      for (const entry of terminalEntries) {
        entries.addEntry(entry);
      }

      // Update running cost estimate
      const runningCost = extractRunningCost(event);
      if (runningCost) cost.set(runningCost);

      // Track tool events for scope calculation
      if (event.type === 'tool_use' || event.type === 'tool_result') {
        toolEvents = [...toolEvents, event];
        scope.set(extractScope(toolEvents));
      }

      // Track tool names and affected files for session reporting
      if (event.type === 'tool_use') {
        toolNames.add(event.tool_name);
        const input = event.tool_input;
        if (input.file_path) filesAffected.add(input.file_path as string);
        if (input.path) filesAffected.add(input.path as string);
      }

      // Handle completion
      if (event.type === 'result') {
        cost.set(extractCost(event));
        status.set(event.is_error ? 'error' : 'complete');
        taskComplete = !event.is_error;
        taskFailed = event.is_error;

        if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
        if (messageInterval) { clearInterval(messageInterval); messageInterval = null; }

        // Report session to backend for Langfuse observability
        const config = get(projectConfig);
        const traceId = get(lastPlanTraceId) ?? get(lastTraceId) ?? undefined;
        reportClaudeSession({
          session_id: event.session_id,
          prompt: sessionPrompt,
          result: event.result,
          is_error: event.is_error,
          was_interrupted: false,
          was_unhinged: wasUnhinged,
          duration_ms: event.duration_ms,
          duration_api_ms: event.duration_api_ms,
          num_turns: event.num_turns,
          cost_usd: event.cost_usd ?? 0,
          total_cost_usd: event.total_cost_usd ?? 0,
          input_tokens: event.usage?.input_tokens ?? 0,
          output_tokens: event.usage?.output_tokens ?? 0,
          tools_used: [...toolNames],
          files_affected: [...filesAffected],
          project_path: config?.project.path ?? '.',
          prediction_trace_id: traceId,
        });

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
              onclick: handleBackToHome,
            },
          ]);
        }
      }
    });

    // Consume pending prompt
    const prompt = get(pendingClaudePrompt);
    if (prompt) {
      pendingClaudePrompt.set(null);
      sessionPrompt = prompt;
      wasUnhinged = prompt.includes('\n\nALSO:');
      startTime = Date.now();

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
    abortController.abort();
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
      <div class="mb-2">
        <ActionCard
          button="A"
          title="Continue"
          description="Proceed to QA review"
          variant="primary"
          selected={$selectedCardIndex === 0}
          onclick={handleContinue}
          animationType={animatingButton === 'A' ? animatingType : null}
        />
      </div>
      <ActionCard
        button="B"
        title="Back to Home"
        description="Return to the main screen"
        variant="secondary_pink"
        selected={$selectedCardIndex === 1}
        onclick={handleBackToHome}
        animationType={animatingButton === 'B' ? animatingType : null}
      />
    {:else}
      <ActionCard
        button="B"
        title="Interrupt"
        description="Stop Claude Code and revert to last checkpoint"
        variant="secondary_pink"
        selected={true}
        onclick={handleInterrupt}
      />
    {/if}
  </div>

  {#if taskComplete}
    <HintGrid hints={[
      { key: 'A', label: 'Continue' },
      { key: 'B', label: 'Back to Home' },
      { key: 'SELECT', label: 'Focus Log' },
      { key: 'LB+RB', label: 'Voice' },
    ]} />
  {:else}
    <HintGrid hints={[
      { key: 'B', label: 'Interrupt' },
      { key: 'START', label: 'Menu' },
      { key: 'SELECT', label: 'Focus Log' },
      { key: 'LB+RB', label: 'Voice' },
    ]} />
  {/if}
</aside>
