<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import { projectConfig } from '../stores/configStores';
  import { getTimeline, getCommitDiff, type TimelineEntry } from '../history/timeline';
  import { previewRollback, executeRollback } from '../history/rollback';
  import { glyph } from '../input/inputMode.svelte';

  let timeline = $state<TimelineEntry[]>([]);
  let confirmingRollback = $state(false);
  let rollbackTarget = $state<TimelineEntry | null>(null);

  // Use selectedCardIndex as timeline cursor
  let selectedIdx = $derived($selectedCardIndex);

  function getCwd(): string {
    return get(projectConfig)?.project.path ?? '.';
  }

  async function loadTimeline() {
    const cwd = getCwd();
    confirmingRollback = false;
    rollbackTarget = null;

    entries.clear();
    status.set('streaming');

    timeline = await getTimeline(cwd);
    selectedCardIndex.set(0);

    if (timeline.length === 0) {
      entries.addEntry({ type: 'thought', label: 'HISTORY', body: 'No DeckForge commits found.' });
      entries.addEntry({ type: 'cursor', message: 'Press B to go back.' });
      status.set('idle');
      scope.set('History');
      registerCards();
      return;
    }

    renderTimeline(0);

    status.set('idle');
    scope.set('History');
    cost.set(`${timeline.length} commits`);

    registerCards();
  }

  function renderTimeline(highlightIdx: number) {
    entries.clear();
    entries.addEntry({ type: 'prompt', label: 'TIMELINE', body: `${timeline.length} commit${timeline.length !== 1 ? 's' : ''}` });

    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i];
      const selected = i === highlightIdx;
      const currentTag = entry.is_current ? ' <span class="text-primary font-bold">← HEAD</span>' : '';
      const stats = `<span class="text-slate-500">${entry.files_changed} file${entry.files_changed !== 1 ? 's' : ''} · +${entry.insertions} -${entry.deletions}</span>`;
      const prefix = selected ? '<span class="text-primary font-bold">▸</span> ' : '  ';
      entries.addEntry({
        type: 'timestamp',
        time: entry.sha,
        message: `${prefix}${entry.message} ${stats} <span class="text-slate-600">· ${entry.relative_time}</span>${currentTag}`,
      });
    }

    entries.addEntry({ type: 'cursor', message: 'D-pad to select · A to preview · Y to rollback · B to go back' });
  }

  function registerCards() {
    // Register one dummy card per timeline entry so navigateUp/Down works,
    // plus A and Y action handlers
    const timelineCards = timeline.map((_, i) => ({
      button: `timeline_${i}`,
      title: '',
      description: '',
    }));

    screenCards.set([
      ...timelineCards,
      { title: 'Preview', description: '', onclick: handlePreview },
      { button: 'Y', title: 'Rollback', description: '', onclick: handleRollback },
    ]);
  }

  function registerRollbackConfirmCards() {
    screenCards.set([
      { title: 'Confirm Rollback', description: '', onclick: handleConfirmRollback },
      { title: 'Cancel', description: '', onclick: handleCancelRollback },
    ]);
  }

  // ─── Card handlers ──────────────────────────────────────────────────────

  function handlePreview() {
    const idx = get(selectedCardIndex);
    const entry = timeline[idx];
    if (!entry) return;
    const cwd = getCwd();

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'COMMIT PREVIEW', body: `${entry.sha} — ${entry.message}` });

    getCommitDiff(entry.sha, cwd).then((diff) => {
      status.set('complete');
      entries.addEntry({ type: 'code', filePath: `${entry.sha} diff`, diff: true, content: diff });
      entries.addEntry({ type: 'cursor', message: 'Press A to preview another · Y to rollback · B to go back' });
    });
  }

  function handleRollback() {
    const idx = get(selectedCardIndex);
    const entry = timeline[idx];
    if (!entry) return;

    if (entry.is_current) {
      entries.clear();
      entries.addEntry({ type: 'thought', label: 'ROLLBACK', body: 'Already at this commit. Nothing to undo.' });
      entries.addEntry({ type: 'cursor', message: 'Select an older commit to rollback.' });
      return;
    }

    const cwd = getCwd();
    confirmingRollback = true;
    rollbackTarget = entry;

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'ROLLBACK CONFIRMATION', body: '' });
    entries.addEntry({
      type: 'thought',
      label: 'TARGET',
      body: `Rolling back to ${entry.sha}: ${entry.message}`,
    });

    previewRollback(entry.sha, cwd).then((preview) => {
      if (preview.commits_to_undo.length > 0) {
        entries.addEntry({ type: 'prompt', label: 'WILL BE UNDONE', body: '' });
        for (const c of preview.commits_to_undo) {
          entries.addEntry({
            type: 'timestamp',
            time: c.sha,
            message: `${c.message} <span class="text-slate-500">· ${c.relative_time}</span>`,
          });
        }
      }

      entries.addEntry({
        type: 'code',
        filePath: 'rollback summary',
        diff: false,
        content: `Commits to revert: ${preview.commits_to_undo.length}
Files affected:     ${preview.total_files_affected}
Lines added:        +${preview.total_insertions}
Lines removed:      -${preview.total_deletions}

Safety: Uses revert commits (rollback itself is undoable)`,
      });

      entries.addEntry({ type: 'cursor', message: 'Press A to confirm rollback · B to cancel' });
      status.set('idle');

      selectedCardIndex.set(0);
      registerRollbackConfirmCards();
    });
  }

  function handleConfirmRollback() {
    if (!rollbackTarget) return;
    const cwd = getCwd();
    const sha = rollbackTarget.sha;

    entries.clear();
    status.set('streaming');
    entries.addEntry({ type: 'prompt', label: 'ROLLING BACK', body: '' });
    entries.addEntry({ type: 'timestamp', time: '→', message: `Reverting to ${sha}...` });

    executeRollback(sha, cwd).then((result) => {
      if (result.success) {
        entries.addEntry({
          type: 'thought',
          label: 'ROLLBACK SUCCESS',
          body: result.message,
        });
        entries.addEntry({ type: 'cursor', message: 'Rollback complete. Returning to home...' });
        status.set('complete');

        setTimeout(() => navigate('level1'), 1500);
      } else {
        entries.addEntry({
          type: 'thought',
          label: 'ROLLBACK FAILED',
          body: result.message,
        });
        entries.addEntry({ type: 'cursor', message: 'Rollback failed. Press B to go back.' });
        status.set('error');

        confirmingRollback = false;
        rollbackTarget = null;
        registerCards();
      }
    });
  }

  function handleCancelRollback() {
    confirmingRollback = false;
    rollbackTarget = null;
    loadTimeline();
  }

  onMount(() => {
    loadTimeline();
  });

  // Re-render timeline when selection changes
  $effect(() => {
    if (timeline.length > 0 && !confirmingRollback) {
      const idx = Math.min(selectedIdx, timeline.length - 1);
      renderTimeline(idx);
    }
  });
</script>

<TerminalPanel />
<aside class="flex-1 min-w-[280px] bg-surface-dark border-l border-surface-border flex flex-col z-20 shadow-2xl">
  <div class="p-3 border-b border-surface-border bg-surface-dark">
    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
      {confirmingRollback ? 'Rollback Confirmation' : 'History'}
    </h2>
    <p class="text-[10px] text-slate-600">
      {confirmingRollback ? 'Confirm or cancel the rollback' : 'Git-backed timeline of DeckForge actions'}
    </p>
  </div>

  <div class="flex-1 overflow-hidden min-h-0 p-2 space-y-2">
    {#if confirmingRollback}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity" onclick={handleConfirmRollback}>
        <div class="bg-surface-dark border border-primary/30 hover:border-primary/50 p-3 rounded relative transition-all border-l-primary border-l-2 shadow-[inset_0_0_15px_rgba(13,242,242,0.1)]">
          <h3 class="text-primary font-medium text-sm mb-1">Confirm Rollback</h3>
          <p class="text-xs text-slate-400 leading-snug">Revert commits using safe revert (undoable)</p>
        </div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity" onclick={handleCancelRollback}>
        <div class="bg-surface-dark border border-red-400/30 hover:border-red-400/50 p-3 rounded relative transition-all">
          <h3 class="text-red-400 font-medium text-sm mb-1">Cancel</h3>
          <p class="text-xs text-slate-400 leading-snug">Return to timeline</p>
        </div>
      </div>
    {:else}
      <!-- Preview card -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity" onclick={handlePreview}>
        <div class="bg-surface-dark border border-primary/30 hover:border-primary/50 p-3 rounded relative transition-all">
          <h3 class="text-primary font-medium text-sm mb-1">Preview Commit</h3>
          <p class="text-xs text-slate-400 leading-snug">Show the diff for the selected commit</p>
          {#if timeline[selectedIdx]}
            <span class="inline-block mt-1 text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-sm">
              {timeline[selectedIdx].sha}
            </span>
          {/if}
        </div>
      </div>
      <!-- Rollback card -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group opacity-80 hover:opacity-100 transition-opacity" onclick={handleRollback}>
        <div class="bg-surface-dark border border-amber-400/30 hover:border-amber-400/50 p-3 rounded relative transition-all">
          <h3 class="text-amber-400 font-medium text-sm mb-1">Rollback to Here</h3>
          <p class="text-xs text-slate-400 leading-snug">Undo all commits after the selected one</p>
          {#if timeline[selectedIdx] && !timeline[selectedIdx].is_current}
            <span class="inline-block mt-1 text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/20 px-1.5 py-0.5 rounded-sm">
              Reversible
            </span>
          {:else}
            <span class="inline-block mt-1 text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-sm">
              Already at HEAD
            </span>
          {/if}
        </div>
      </div>

      <div class="h-px bg-surface-border my-1"></div>

      <!-- Timeline position indicator -->
      <p class="text-[10px] text-slate-600 px-1">
        {timeline.length} commit{timeline.length !== 1 ? 's' : ''} · Selected: {Math.min(selectedIdx, timeline.length - 1) + 1}/{timeline.length}
      </p>
    {/if}
  </div>

  <div class="p-2 bg-[#0b0e11] border-t border-surface-border text-center">
    {#if confirmingRollback}
      <p class="text-[10px] text-slate-500 font-mono">
        <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('A')}</span> Select &middot;
        <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('B')}</span> Back
      </p>
    {:else}
      <p class="text-[10px] text-slate-500 font-mono">
        <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('A')}</span> Select &middot;
        <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('B')}</span> Back &middot;
        <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('Y')}</span> Rollback &middot;
        <span class="bg-slate-700 text-white px-1 rounded mx-0.5">{glyph('D-PAD')}</span> Navigate
      </p>
    {/if}
  </div>
</aside>
