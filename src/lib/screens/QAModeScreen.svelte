<script lang="ts">
  import { onMount } from 'svelte';
  import TerminalPanel from '../components/TerminalPanel.svelte';
  import ActionPalette from '../components/ActionPalette.svelte';
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';
  import { entries, status, cost, scope } from '../stores/terminal';
  import type { TerminalEntry } from '../stores/terminal';

  onMount(() => {
    entries.clear();
    const qaEntries: TerminalEntry[] = [
      { type: 'prompt', label: 'EXECUTION LOG', body: '' },
      { type: 'timestamp', time: '10:44:22', message: '<span class="text-emerald-400">Created</span> SearchInput.tsx' },
      { type: 'timestamp', time: '10:44:25', message: '<span class="text-amber-400">Modified</span> UserList.tsx' },
      { type: 'timestamp', time: '10:44:28', message: '<span class="text-amber-400">Modified</span> UserList.test.tsx' },
      { type: 'timestamp', time: '10:44:30', message: 'Running tests...' },
      { type: 'timestamp', time: '10:44:35', message: '<span class="text-emerald-400 font-bold">All 12 tests passed</span> ✓' },
      { type: 'code', filePath: 'src/components/SearchInput.tsx', diff: true, content: `import React, { useState } from 'react';

export const SearchInput = ({ onSearch }) => {
+  const [value, setValue] = useState('');

+  const handleChange = (e) => {
+    setValue(e.target.value);
+    onSearch(e.target.value);
+  };

  return (
+    <input
+      type="text"
+      value={value}
+      onChange={handleChange}
+      placeholder="Search..."
+      className="search-input"
+    />
  );
};` },
      { type: 'thought', label: 'TEST RESULTS', body: '12 passed · 0 failed · 0 skipped' },
      { type: 'cursor', message: 'QA review required...' },
    ];
    status.set('complete');
    cost.set('$0.04');
    scope.set('3 Files Changed');
    qaEntries.forEach(e => entries.addEntry(e));
  });

  const cards = [
    {
      button: 'A',
      title: 'Approve and Commit',
      description: 'Accept all changes and create a git commit.',
      pills: [{ label: '3 files', variant: 'active' as const }],
      variant: 'primary' as const,
      onclick: () => navigate('deploy_mode'),
    },
    {
      button: 'B',
      title: 'Reject Changes',
      description: 'Revert all modifications. Nothing will be saved.',
      pills: [{ label: 'Undo all', variant: 'neutral' as const }],
      variant: 'secondary_pink' as const,
      onclick: () => navigate('level1'),
    },
    {
      button: 'X',
      title: 'Run Tests Again',
      description: 'Re-execute the test suite to double check.',
      pills: [{ label: '12 tests', variant: 'neutral' as const }],
      variant: 'neutral' as const,
    },
    {
      button: 'Y',
      title: 'View Full Diff',
      description: 'Open a detailed diff view of every changed file.',
      pills: [{ label: '3 files', variant: 'neutral' as const }],
      variant: 'neutral' as const,
    },
  ];

  const secondaryCards = [
    { button: 'RB', label: 'Request Changes', icon: 'edit_note' },
    { button: 'LB', label: 'Explain Changes', icon: 'question_answer' },
  ];

  screenCards.set(cards.map(c => ({ button: c.button, title: c.title, description: c.description, onclick: c.onclick })));
</script>

<TerminalPanel />
<ActionPalette
  title="QA Review"
  subtitle="Verify the changes before committing"
  {cards}
  {secondaryCards}
  selectedIndex={$selectedCardIndex}
/>
