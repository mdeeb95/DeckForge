<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import {
    selectedCategory,
    currentPrediction,
    currentPairA,
    currentPairB,
    predictionsLoading,
    predictionError,
    rerollSuggestions,
    loadPredictions,
    selectAndPlan,
  } from '../stores/prediction';
  import type { TerminalEntry } from '../stores/terminal';
  import { getRandomMessage } from '../personality/messages';

  let abortController: AbortController;

  // Animation state
  let animatingType = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
  let animatingIndex = $state<number | null>(null);

  // Reactive state from stores
  let prediction = $derived($currentPrediction);
  let pairA = $derived($currentPairA);
  let pairB = $derived($currentPairB);
  let loading = $derived($predictionsLoading);
  let error = $derived($predictionError);
  let category = $derived($selectedCategory);

  // Build cards reactively from current prediction state
  let cards = $derived.by(() => {
    if (loading || !prediction) {
      const loadMsg = getRandomMessage('loading');
      return [
        {
          title: 'Loading...',
          description: loadMsg,
          pills: [{ label: 'Wait', variant: 'neutral' as const }],
          variant: 'neutral' as const,
        },
        {
          title: '',
          description: '',
          pills: [],
          variant: 'neutral' as const,
        },
      ] as {
        button?: string;
        title: string;
        description: string;
        pills: { label: string; variant: 'active' | 'neutral' }[];
        variant: 'primary' | 'secondary_pink' | 'neutral' | 'amber';
        onclick?: () => void;
      }[];
    }

    const result: {
      button?: string;
      title: string;
      description: string;
      pills: { label: string; variant: 'active' | 'neutral' }[];
      variant: 'primary' | 'secondary_pink' | 'neutral' | 'amber';
      onclick?: () => void;
    }[] = [];

    // First suggestion in pair
    if (pairA) {
      const idx = result.length;
      result.push({
        title: pairA.label,
        description: pairA.quip,
        pills: [{ label: pairA.scope, variant: 'active' as const }],
        variant: 'primary' as const,
        onclick: () => {
          if (animatingType) return;
          animatingType = 'confirm';
          animatingIndex = idx;
          screenCards.set([]);
          selectAndPlan(pairA!);
          setTimeout(() => {
            animatingType = null;
            animatingIndex = null;
            navigate('level3');
          }, 350);
        },
      });
    }

    // Second suggestion in pair
    if (pairB) {
      const idx = result.length;
      result.push({
        title: pairB.label,
        description: pairB.quip,
        pills: [{ label: pairB.scope, variant: 'neutral' as const }],
        variant: 'secondary_pink' as const,
        onclick: () => {
          if (animatingType) return;
          animatingType = 'confirm';
          animatingIndex = idx;
          screenCards.set([]);
          selectAndPlan(pairB!);
          setTimeout(() => {
            animatingType = null;
            animatingIndex = null;
            navigate('level3');
          }, 350);
        },
      });
    }

    // Wild card suggestion
    if (prediction.wild_card) {
      const idx = result.length;
      result.push({
        title: prediction.wild_card.label,
        description: prediction.wild_card.quip,
        pills: [{ label: prediction.wild_card.scope, variant: 'neutral' as const }],
        variant: 'amber' as const,
        onclick: () => {
          if (animatingType) return;
          animatingType = 'confirm';
          animatingIndex = idx;
          screenCards.set([]);
          selectAndPlan(prediction!.wild_card);
          setTimeout(() => {
            animatingType = null;
            animatingIndex = null;
            navigate('level3');
          }, 350);
        },
      });
    }

    // Reroll card
    result.push({
      title: 'Reroll Suggestions',
      description: 'Shuffle to the next pair of suggestions.',
      pills: [{ label: `${prediction.suggestions.length} available`, variant: 'neutral' as const }],
      variant: 'neutral' as const,
      onclick: () => rerollSuggestions(),
    });

    return result;
  });

  let secondaryCards = $derived([
    { button: 'LB', label: 'Back to Categories', icon: 'arrow_back' },
  ]);

  // Category display name
  let categoryLabel = $derived(
    category === 'feature' ? 'Feature' :
    category === 'bug' ? 'Bug' :
    category === 'tech_debt' ? 'Tech Debt' :
    category === 'yolo' ? 'Yolo' : 'Suggestions'
  );

  // Update screenCards whenever cards change (include LB so activateByButton works)
  $effect(() => {
    const mainCards = cards.map(c => ({
      button: c.button,
      title: c.title,
      description: c.description,
      onclick: c.onclick,
    }));
    screenCards.set([
      ...mainCards,
      { button: 'LB', title: 'Back to Categories', description: '', onclick: () => navigate('level1') },
    ]);
  });

  // Show thinking state while loading
  $effect(() => {
    if (loading) {
      entries.clear();
      entries.addEntry({
        type: 'thinking',
        message: getRandomMessage('loading'),
      });
      status.set('streaming');
    }
  });

  // Update terminal when predictions load
  $effect(() => {
    if (!prediction || loading) return;

    entries.clear();

    const termEntries: TerminalEntry[] = [
      {
        type: 'timestamp',
        time: new Date().toTimeString().slice(0, 8),
        message: `Category: <span class="text-primary">${categoryLabel}</span>`,
      },
      {
        type: 'prompt',
        label: 'PREDICTION ENGINE',
        body: prediction.header_quip,
      },
    ];

    // Show all 8 suggestions as a numbered list
    prediction.suggestions.forEach((s, i) => {
      const isCurrent = (pairA && s.label === pairA.label) || (pairB && s.label === pairB.label);
      const marker = isCurrent ? '<span class="text-primary">▸</span>' : ' ';
      termEntries.push({
        type: 'timestamp',
        time: `${i + 1}.`,
        message: `${marker} ${s.label} <span class="text-slate-500">— ${s.scope}</span>`,
      });
    });

    // Show wild card
    termEntries.push({
      type: 'thought',
      label: 'WILD CARD',
      body: `${prediction.wild_card.label} — <em>${prediction.wild_card.quip}</em>`,
    });

    termEntries.push({
      type: 'cursor',
      message: 'Select a suggestion, or reroll for more...',
    });

    status.set('idle');
    cost.set('$0.00');
    scope.set(`${prediction.suggestions.length} options`);
    termEntries.forEach(e => entries.addEntry(e));
  });

  // Expose reroll for the input router
  onMount(() => {
    abortController = new AbortController();
    // Re-check: if no predictions loaded yet and we have a category, load them
    if (!prediction && category) {
      loadPredictions(category, abortController.signal);
    }
  });

  onDestroy(() => {
    abortController.abort();
  });
</script>

<TerminalPanel />
<ActionPalette
  breadcrumb="Suggestions · {categoryLabel}"
  step={2}
  title="{categoryLabel} Suggestions"
  subtitle={prediction?.header_quip ?? getRandomMessage('loading')}
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
  {animatingIndex}
  animationType={animatingType}
  hints={[
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'Y', label: 'Reroll' },
    { key: 'START', label: 'Menu' },
  ]}
/>
