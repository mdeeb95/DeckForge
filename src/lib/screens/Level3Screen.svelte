<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import { selectedSuggestion, currentPlan, trackPlanApproval, trackPlanRejection } from '../stores/prediction';
  import type { TerminalEntry } from '../stores/terminal';

  let abortController: AbortController;

  let suggestion = $derived($selectedSuggestion);
  let plan = $derived($currentPlan);

  let animatingShip = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
  let animatingButton = $state<'A' | 'B' | 'X' | 'Y' | null>(null);
  let shipAnimationCount = 0; // persists across L3 visits within session

  // Populate terminal with plan details when plan loads
  $effect(() => {
    if (!plan) return;

    entries.clear();

    const termEntries: TerminalEntry[] = [];

    // Show the selected suggestion as the prompt
    termEntries.push({
      type: 'prompt',
      label: 'SELECTED',
      body: suggestion?.label ?? plan.summary,
    });

    // Plan header
    termEntries.push({
      type: 'prompt',
      label: 'PLAN',
      body: plan.quip,
    });

    // Numbered plan steps
    for (const step of plan.steps) {
      termEntries.push({
        type: 'timestamp',
        time: `${step.n}.`,
        message: step.text,
      });
    }

    // Scope summary
    termEntries.push({
      type: 'thought',
      label: 'SCOPE',
      body: `${plan.steps.length} steps · ${plan.scope} · confidence: ${plan.confidence}`,
    });

    termEntries.push({
      type: 'cursor',
      message: 'Awaiting confirmation...',
    });

    status.set('idle');
    cost.set('est. $0.03');
    scope.set(`${plan.steps.length} steps`);
    termEntries.forEach(e => entries.addEntry(e));
  });

  function shipIt(unhinged = false) {
    if (!plan || animatingShip) return;

    trackPlanApproval(unhinged);

    let prompt = plan.claude_code_intent;
    if (unhinged && plan.unhinged_modifier) {
      prompt += `\n\nALSO: ${plan.unhinged_modifier}`;
    }

    // Alternate between glitch and confirm
    animatingShip = shipAnimationCount % 2 === 0 ? 'glitch' : 'confirm';
    animatingButton = unhinged ? 'Y' : 'A';
    shipAnimationCount++;
    screenCards.set([]); // lock gamepad during animation
    pendingClaudePrompt.set(prompt);

    setTimeout(() => {
      animatingShip = null;
      animatingButton = null;
      navigate('ai_working');
    }, 450);
  }

  function goBack() {
    if (animatingShip) return;
    trackPlanRejection();

    animatingShip = 'dismiss';
    animatingButton = 'B';
    screenCards.set([]); // lock gamepad

    setTimeout(() => {
      animatingShip = null;
      animatingButton = null;
      navigate('level2');
    }, 300);
  }

  let expandDepth = $state(0);
  let isExpanding = $state(false);

  async function expandPlan() {
    if (!plan) {
      entries.addEntry({ type: 'cursor', message: 'No plan to expand.' });
      return;
    }
    if (isExpanding) return; // debounce

    // Flash the pulse animation (cosmetic, doesn't block the action)
    animatingShip = 'pulse';
    animatingButton = 'X';
    setTimeout(() => {
      animatingShip = null;
      animatingButton = null;
    }, 350);

    isExpanding = true;
    expandDepth++;
    status.set('streaming');

    entries.addEntry({
      type: 'prompt',
      label: `EXPANDING (DEPTH ${expandDepth})`,
      body: expandDepth === 1
        ? 'Digging deeper into the plan...'
        : expandDepth === 2
          ? 'Going even deeper...'
          : expandDepth === 3
            ? 'How deep does this rabbit hole go?'
            : `Depth ${expandDepth}. You really like hitting X, huh?`,
    });

    try {
      const { expandPlanRemote } = await import('../prediction/client');
      const { buildContextPayload } = await import('../prediction/contextAssembler');
      const { get } = await import('svelte/store');
      const { projectConfig, projectBehavior } = await import('../stores/configStores');

      const config = get(projectConfig);
      const behavior = get(projectBehavior);

      let expanded;
      if (config) {
        const context = await buildContextPayload(config, behavior);
        expanded = await expandPlanRemote(plan, context, expandDepth, abortController.signal);
      } else {
        expanded = await expandPlanRemote(plan, {} as any, expandDepth, abortController.signal);
      }

      // If aborted between fetch and rendering, bail
      if (abortController.signal.aborted) return;

      console.log('[expand-plan] Parsed response:', {
        depth: expanded.depth,
        stepCount: expanded.steps.length,
        commentary: expanded.commentary,
        firstStep: expanded.steps[0],
      });

      // Render expansion results to terminal
      for (const step of expanded.steps) {
        const n = step.n ?? 0;
        const title = step.title || step.text || '';
        const label = `STEP ${n} · DEPTH ${expandDepth}`;

        // Show step title if present
        if (title) {
          entries.addEntry({
            type: 'timestamp',
            time: `${n}.`,
            message: title,
          });
        }

        // Show description as a separate thought if present and different from title
        if (step.description && step.description !== title) {
          entries.addEntry({
            type: 'thought',
            label,
            body: step.description,
          });
        }

        if (step.substeps) {
          entries.addEntry({
            type: 'thought',
            label: `${label} · SUBSTEPS`,
            body: step.substeps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
          });
        }
        if (step.files_affected) {
          entries.addEntry({
            type: 'timestamp',
            time: `${n}.`,
            message: `Files: ${step.files_affected.join(', ')}`,
          });
        }
        if (step.risks) {
          entries.addEntry({
            type: 'thought',
            label: `STEP ${n} RISKS`,
            body: step.risks.join(' · '),
          });
        }
        if (step.alternatives) {
          entries.addEntry({
            type: 'thought',
            label: `ALT · STEP ${n}`,
            body: step.alternatives.join('\n'),
          });
        }
        if (step.what_could_go_wrong) {
          entries.addEntry({
            type: 'thought',
            label: `WORST CASE · STEP ${n}`,
            body: step.what_could_go_wrong,
          });
        }
      }

      // Commentary
      if (expanded.commentary) {
        entries.addEntry({
          type: 'cursor',
          message: expanded.commentary,
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[expand-plan] Expansion failed:', err);
      entries.addEntry({
        type: 'cursor',
        message: `Expansion failed: ${err}. Press X to try again.`,
      });
      expandDepth--; // allow retry at same depth
    }

    // Only update UI state if still on this screen
    if (abortController.signal.aborted) return;
    status.set('idle');
    isExpanding = false;
  }

  // Level 3 cards
  let cards = $derived.by(() => {
    const planReady = plan != null;
    const stepCount = plan?.steps.length ?? 0;
    const scopeLabel = plan?.scope ?? 'decent chunk';

    return [
      {
        button: 'A',
        title: planReady ? 'Ship It' : 'Generating Plan...',
        description: planReady
          ? `Execute the plan as-is. Claude Code will implement all ${stepCount} steps.`
          : 'Waiting for plan to finish generating...',
        pills: planReady
          ? [{ label: scopeLabel, variant: 'active' as const }]
          : [{ label: 'loading', variant: 'neutral' as const }],
        variant: planReady ? 'primary' as const : 'neutral' as const,
        onclick: planReady ? () => shipIt() : undefined,
      },
      {
        button: 'B',
        title: 'Nah, Go Back',
        description: 'Return to suggestions. This plan won\'t be saved.',
        pills: [{ label: 'No cost', variant: 'neutral' as const }],
        variant: 'secondary_pink' as const,
        onclick: goBack,
      },
      {
        button: 'X',
        title: expandDepth === 0 ? 'Tell Me More' : `Dig Deeper (${expandDepth})`,
        description: planReady
          ? expandDepth === 0
            ? 'Ask Claude to explain the reasoning behind each step.'
            : `Press again for depth ${expandDepth + 1}. Each press reveals more.`
          : 'Available after plan generates.',
        pills: [{ label: expandDepth === 0 ? 'Clarify' : `Depth ${expandDepth}`, variant: 'neutral' as const }],
        variant: 'neutral' as const,
        onclick: planReady ? () => expandPlan() : undefined,
      },
      {
        button: 'Y',
        title: planReady ? 'Ship It Unhinged' : 'Generating...',
        description: planReady
          ? (plan?.unhinged_modifier ?? 'Approve with extra creative freedom.')
          : 'Waiting for plan...',
        pills: planReady
          ? [{ label: 'Unhinged', variant: 'neutral' as const }]
          : [{ label: 'loading', variant: 'neutral' as const }],
        variant: planReady ? 'amber' as const : 'neutral' as const,
        onclick: planReady ? () => shipIt(true) : undefined,
      },
    ];
  });

  const secondaryCards = [
    { button: 'RB', label: 'Modify Plan', icon: 'edit_note' },
    { button: 'LB', label: 'Back to Categories', icon: 'arrow_back' },
  ];

  // Update screenCards reactively
  $effect(() => {
    screenCards.set(cards.map(c => ({
      button: c.button,
      title: c.title,
      description: c.description,
      onclick: c.onclick,
    })));
  });

  onMount(() => {
    abortController = new AbortController();
    // If no plan loaded, show a loading state
    if (!plan) {
      entries.clear();
      entries.addEntry({
        type: 'cursor',
        message: 'Generating plan...',
      });
      status.set('streaming');
    }
  });

  onDestroy(() => {
    abortController.abort();
  });
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Plan Review"
  step={3}
  title="Plan Review"
  subtitle={plan ? plan.summary : 'Generating plan...'}
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  {animatingButton}
  animationType={animatingShip}
  hints={[
    { key: 'A', label: 'Ship It' },
    { key: 'B', label: 'Back' },
    { key: 'X', label: 'Tell Me More' },
    { key: 'Y', label: 'Ship Unhinged' },
  ]}
/>
