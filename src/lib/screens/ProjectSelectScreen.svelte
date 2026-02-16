<script lang="ts">
  import { selectedCardIndex, navigate, screenCards } from '../stores/app';

  const projects = [
    {
      name: 'neo-dashboard-v2',
      description: 'React + TypeScript · Last session: 2h ago · 47 files',
      pills: [{ label: 'Active', variant: 'active' as const }, { label: 'main · clean', variant: 'neutral' as const }],
    },
    {
      name: 'api-gateway-rust',
      description: 'Rust + Actix · Last session: 3d ago · 23 files',
      pills: [{ label: 'Idle', variant: 'neutral' as const }, { label: 'dev · 2 ahead', variant: 'neutral' as const }],
    },
    {
      name: 'pixel-art-editor',
      description: 'Svelte + Canvas · Last session: 1w ago · 15 files',
      pills: [{ label: 'Stale', variant: 'neutral' as const }],
    },
    {
      name: 'cli-task-runner',
      description: 'Go · Last session: 2w ago · 8 files',
      pills: [{ label: 'Archived', variant: 'neutral' as const }],
    },
  ];

  screenCards.set(projects.map((p, i) => ({
    button: ['A', 'B', 'X', 'Y'][i],
    title: p.name,
    description: p.description,
    onclick: () => navigate('level1'),
  })));
</script>

<!-- Full-width centered layout -->
<div class="flex-1 overflow-hidden bg-background-dark">
<div class="h-full flex items-center justify-center relative">
  <div class="w-full max-w-[800px] px-8">
    <!-- Heading -->
    <div class="text-center mb-6">
      <h1 class="text-primary font-bold text-xl font-mono flex items-center justify-center gap-2 mb-3">
        <span class="material-icons text-sm">terminal</span>
        DeckForge
      </h1>
      <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Select a Project</h2>
      <p class="text-xs text-slate-500">Choose an existing project or create a new one</p>
    </div>

    <!-- Project list -->
    <div class="space-y-2 mb-4">
      {#each projects as project, i}
        {#if i === $selectedCardIndex}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="relative group cursor-pointer" onclick={() => navigate('level1')}>
            <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
            <div class="bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
              <div class="absolute top-0 right-0 p-1.5 bg-primary text-black rounded-bl font-bold text-xs shadow-sm">{['A','B','X','Y'][i]}</div>
              <h3 class="text-primary font-bold text-sm mb-1 pr-6 truncate">{project.name}</h3>
              <p class="text-xs text-slate-300 leading-snug mb-2">{project.description}</p>
              <div class="flex items-center gap-2 text-[10px]">
                {#each project.pills as pill}
                  <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{pill.label}</span>
                {/each}
              </div>
            </div>
          </div>
        {:else}
          <div class="relative group opacity-80 hover:opacity-100 transition-opacity">
            <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative transition-colors">
              <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center {i === 1 ? 'bg-secondary/20 text-secondary border border-secondary/30' : 'bg-slate-700 text-slate-300 border border-slate-600'} rounded-full font-bold text-[10px]">{['A','B','X','Y'][i]}</div>
              <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate">{project.name}</h3>
              <p class="text-xs text-slate-400 leading-snug mb-2">{project.description}</p>
              <div class="flex items-center gap-2 text-[10px]">
                {#each project.pills as pill}
                  <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">{pill.label}</span>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      {/each}

      <div class="h-px bg-surface-border my-2"></div>

      <div class="relative group">
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">RB</div>
            <span class="text-xs text-slate-300 font-medium">Scan for Projects</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">folder_open</span>
        </div>
      </div>
      <div class="relative group">
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">LB</div>
            <span class="text-xs text-slate-300 font-medium">Add Project Manually</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">add</span>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
