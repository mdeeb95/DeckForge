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

  // Modifier toggle state
  let modifierActive = $state(false);

  // Animation state
  let animatingType = $state<'glitch' | 'confirm' | 'dismiss' | 'pulse' | null>(null);
  let animatingButton = $state<string | null>(null);

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
          button: 'A',
          title: 'Loading...',
          description: loadMsg,
          pills: [{ label: 'Wait', variant: 'neutral' as const }],
          variant: 'neutral' as const,
        },
        {
          button: 'B',
          title: '',
          description: '',
          pills: [],
          variant: 'neutral' as const,
        },
      ];
    }

    const result: {
      button: string;
      title: string;
      description: string;
      pills: { label: string; variant: 'active' | 'neutral' }[];
      variant: 'primary' | 'secondary_pink' | 'neutral' | 'amber';
      onclick?: () => void;
    }[] = [];

    // A button: first suggestion in pair
    if (pairA) {
      result.push({
        button: 'A',
        title: pairA.label,
        description: pairA.quip,
        pills: [{ label: pairA.scope, variant: 'active' as const }],
        variant: 'primary' as const,
        onclick: () => {
          if (animatingType) return;
          animatingType = 'confirm';
          animatingButton = 'A';
          screenCards.set([]);
          selectAndPlan(pairA!);
          setTimeout(() => {
            animatingType = null;
            animatingButton = null;
            navigate('level3');
          }, 350);
        },
      });
    }

    // B button: second suggestion in pair
    if (pairB) {
      result.push({
        button: 'B',
        title: pairB.label,
        description: pairB.quip,
        pills: [{ label: pairB.scope, variant: 'neutral' as const }],
        variant: 'secondary_pink' as const,
        onclick: () => {
          if (animatingType) return;
          animatingType = 'confirm';
          animatingButton = 'B';
          screenCards.set([]);
          selectAndPlan(pairB!);
          setTimeout(() => {
            animatingType = null;
            animatingButton = null;
            navigate('level3');
          }, 350);
        },
      });
    }

    // X button: modifier
    if (prediction.modifier) {
      result.push({
        button: 'X',
        title: prediction.modifier.lens,
        description: prediction.modifier.quip,
        pills: [{ label: modifierActive ? 'Active' : 'Modifier', variant: modifierActive ? 'active' as const : 'neutral' as const }],
        variant: modifierActive ? 'primary' as const : 'neutral' as const,
        onclick: () => {
          modifierActive = !modifierActive;
          if (modifierActive) {
            entries.addEntry({
              type: 'thought',
              label: 'MODIFIER',
              body: `Lens active: <span class="text-primary">${prediction!.modifier.lens}</span> — ${prediction!.modifier.quip}`,
            });
          } else {
            entries.addEntry({
              type: 'timestamp',
              time: new Date().toTimeString().slice(0, 8),
              message: 'Modifier deactivated',
            });
          }
        },
      });
    }

    // Y button: wild card (always italic/chaotic)
    if (prediction.wild_card) {
      result.push({
        button: 'Y',
        title: prediction.wild_card.label,
        description: prediction.wild_card.quip,
        pills: [{ label: prediction.wild_card.scope, variant: 'neutral' as const }],
        variant: 'amber' as const,
        onclick: () => {
          selectAndPlan(prediction!.wild_card);
          navigate('level3');
        },
      });
    }

    return result;
  });

  let secondaryCards = $derived([
    { button: 'RB', label: 'Reroll Suggestions', icon: 'refresh' },
    { button: 'LB', label: 'Back to Categories', icon: 'arrow_back' },
  ]);

  // Category display name
  let categoryLabel = $derived(
    category === 'feature' ? 'Feature' :
    category === 'bug' ? 'Bug' :
    category === 'tech_debt' ? 'Tech Debt' :
    category === 'yolo' ? 'Yolo' : 'Suggestions'
  );

  // Update screenCards whenever cards change
  $effect(() => {
    screenCards.set(cards.map(c => ({
      button: c.button,
      title: c.title,
      description: c.description,
      onclick: c.onclick,
    })));
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
      message: 'Select A or B, or press RB to reroll...',
    });

    status.set('idle');
    cost.set('$0.00');
    scope.set(`${prediction.suggestions.length} options`);
    termEntries.forEach(e => entries.addEntry(e));
  });

  // Handle RB reroll
  function handleReroll() {
    rerollSuggestions();
  }

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
  {animatingButton}
  animationType={animatingType}
  hints={[
    { key: 'A', label: 'Select' },
    { key: 'B', label: 'Back' },
    { key: 'RB', label: 'Reroll' },
    { key: 'START', label: 'Menu' },
  ]}
/>
