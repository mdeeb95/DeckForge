<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards, pendingClaudePrompt } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import { selectedSuggestion, currentPlan, trackPlanApproval, trackPlanRejection } from '../stores/prediction';
  import type { TerminalEntry } from '../stores/terminal';

  let suggestion = $derived($selectedSuggestion);
  let plan = $derived($currentPlan);

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
    if (!plan) return;

    trackPlanApproval(unhinged);

    let prompt = plan.claude_code_intent;
    if (unhinged && plan.unhinged_modifier) {
      prompt += `\n\nALSO: ${plan.unhinged_modifier}`;
    }

    pendingClaudePrompt.set(prompt);
    navigate('ai_working');
  }

  function goBack() {
    trackPlanRejection();
    navigate('level2');
  }

  // Level 3 cards
  let cards = $derived.by(() => {
    const stepCount = plan?.steps.length ?? 0;
    const scopeLabel = plan?.scope ?? 'decent chunk';

    return [
      {
        button: 'A',
        title: 'Ship It',
        description: `Execute the plan as-is. Claude Code will implement all ${stepCount} steps.`,
        pills: [{ label: scopeLabel, variant: 'active' as const }],
        variant: 'primary' as const,
        onclick: () => shipIt(),
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
        title: 'Tell Me More',
        description: 'Ask Claude to explain the reasoning behind each step.',
        pills: [{ label: 'Clarify', variant: 'neutral' as const }],
        variant: 'neutral' as const,
      },
      {
        button: 'Y',
        title: 'Ship It Unhinged',
        description: plan?.unhinged_modifier ?? 'Approve with extra creative freedom.',
        pills: [{ label: 'Unhinged', variant: 'neutral' as const }],
        variant: 'amber' as const,
        onclick: () => shipIt(true),
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
</script>

<TerminalPanel />
<ActionPalette
  title="Plan Review"
  subtitle={plan ? plan.summary : 'Generating plan...'}
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
/>
