<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import { selectedSuggestion, currentPlan, trackPlanApproval, trackPlanRejection } from '../stores/prediction';
  import type { TerminalEntry } from '../stores/terminal';
  import type { ExpandedPlanResponse } from '../prediction/types';

  let abortController: AbortController;

  let suggestion = $derived($selectedSuggestion);
  let plan = $derived($currentPlan);

  let animatingShip = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
  let animatingIndex = $state<number | null>(null);
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

  function buildEnrichedPrompt(base: string, unhinged: boolean): string {
    let prompt = base;

    if (expansions.length > 0) {
      prompt += '\n\nDetailed plan breakdown:\n';
      for (const expansion of expansions) {
        for (const step of expansion.steps) {
          prompt += `${step.n}. ${step.text}\n`;
          if (step.substeps && step.substeps.length > 0) {
            prompt += `   Substeps: ${step.substeps.map((s, i) => `${i + 1}) ${s}`).join(' ')}\n`;
          }
          if (step.files_affected && step.files_affected.length > 0) {
            prompt += `   Files: ${step.files_affected.join(', ')}\n`;
          }
          if (step.risks && step.risks.length > 0) {
            prompt += `   Risks: ${step.risks.join(', ')}\n`;
          }
        }
      }

      // Append commentary from the latest expansion
      const latest = expansions[expansions.length - 1];
      if (latest.commentary) {
        prompt += `\n${latest.commentary}`;
      }
    }

    if (unhinged && plan?.unhinged_modifier) {
      prompt += `\n\nALSO: ${plan.unhinged_modifier}`;
    }

    return prompt;
  }

  function shipIt(unhinged = false) {
    if (!plan || animatingShip) return;

    trackPlanApproval(unhinged);

    const prompt = buildEnrichedPrompt(plan.claude_code_intent, unhinged);

    // Alternate between glitch and confirm
    animatingShip = shipAnimationCount % 2 === 0 ? 'glitch' : 'confirm';
    animatingIndex = unhinged ? 3 : 0; // Y=index 3, Ship It=index 0
    shipAnimationCount++;
    screenCards.set([]); // lock gamepad during animation
    pendingClaudePrompt.set(prompt);

    setTimeout(() => {
      animatingShip = null;
      animatingIndex = null;
      navigate('ai_working');
    }, 450);
  }

  function goBack() {
    if (animatingShip) return;
    trackPlanRejection();

    animatingShip = 'dismiss';
    animatingIndex = 1; // Go Back is index 1
    screenCards.set([]); // lock gamepad

    setTimeout(() => {
      animatingShip = null;
      animatingIndex = null;
      navigate('level2');
    }, 300);
  }

  let expandDepth = $state(0);
  let isExpanding = $state(false);
  let expansions = $state<ExpandedPlanResponse[]>([]);

  async function expandPlan() {
    if (!plan) {
      entries.addEntry({ type: 'cursor', message: 'No plan to expand.' });
      return;
    }
    if (isExpanding) return; // debounce

    // Flash the pulse animation (cosmetic, doesn't block the action)
    animatingShip = 'pulse';
    animatingIndex = 2; // Tell Me More is index 2
    setTimeout(() => {
      animatingShip = null;
      animatingIndex = null;
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

      expansions = [...expansions, expanded];

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
        title: planReady ? 'Ship It' : 'Generating Plan...',
        description: planReady
          ? `Execute the plan as-is. Claude Code will implement all ${stepCount} steps.`
          : 'Waiting for plan to finish generating...',
        pills: planReady
          ? [{ label: scopeLabel, variant: 'active' as const }]
          : [{ label: 'loading', variant: 'neutral' as const }],
        variant: planReady ? 'primary' as const : 'neutral' as const,
        onclick: planReady && !isExpanding ? () => shipIt() : undefined,
      },
      {
        button: 'B',
        title: 'Nah, Go Back',
        description: 'Return to suggestions. This plan won\'t be saved.',
        pills: [{ label: 'No cost', variant: 'neutral' as const }],
        variant: 'secondary_pink' as const,
        onclick: !isExpanding ? goBack : undefined,
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
        onclick: planReady && !isExpanding ? () => expandPlan() : undefined,
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
        onclick: planReady && !isExpanding ? () => shipIt(true) : undefined,
      },
    ];
  });

  const secondaryCards = [
    { button: 'LB', label: 'Back to Categories', icon: 'arrow_back' },
  ];

  // Update screenCards reactively
  $effect(() => {
    screenCards.set(cards.map(c => ({
      ...(c.button ? { button: c.button } : {}),
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
  {animatingIndex}
  animationType={animatingShip}
  hints={[
    { key: 'A', label: 'Ship It' },
    { key: 'B', label: 'Back' },
    { key: 'X', label: 'Tell Me More' },
    { key: 'Y', label: 'Ship Unhinged' },
  ]}
/>
