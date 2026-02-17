<script lang="ts">
  import { onMount } from 'svelte';
  import { globalConfig, openProject } from '../stores/configStores';
  import { selectedCardIndex, navigate, screenCards, projectName } from '../stores/app';
  import type { RecentProject } from '../types/data';
  import { devLog, devError } from '../utils/devLog';

  let projects = $state<RecentProject[]>([]);

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }

  function frameworkPill(framework: string): string {
    const map: Record<string, string> = {
      svelte: 'Svelte',
      react: 'React',
      vue: 'Vue',
      angular: 'Angular',
      nextjs: 'Next.js',
      nuxt: 'Nuxt',
      express: 'Express',
      fastapi: 'FastAPI',
      django: 'Django',
      flask: 'Flask',
      rails: 'Rails',
    };
    return map[framework.toLowerCase()] || framework || 'Project';
  }

  onMount(async () => {
    const config = $globalConfig;
    if (config?.recent_projects?.length) {
      projects = [...config.recent_projects];

      // Background validation: remove projects whose paths no longer exist
      try {
        const { exists } = await import('@tauri-apps/plugin-fs');
        for (const p of config.recent_projects) {
          try {
            const pathExists = await exists(p.path);
            if (!pathExists) {
              projects = projects.filter(pr => pr.path !== p.path);
            }
          } catch {
            // Skip validation errors silently
          }
        }
      } catch {
        // Not in Tauri environment — skip validation
      }
    }

    updateScreenCards();
  });

  function updateScreenCards() {
    const btns = ['A', 'B', 'X', 'Y'];
    const visibleProjects = projects.slice(0, 4);

    const cards = visibleProjects.map((p, i) => ({
      button: btns[i],
      title: p.name,
      description: p.tech_stack,
      onclick: () => selectProject(p),
    }));

    // Add RB/LB browse cards so activateByButton('RB'/'LB') works
    cards.push({ button: 'RB', title: 'Scan for Projects', description: 'Browse filesystem', onclick: browseForProject });
    cards.push({ button: 'LB', title: 'Add Project Manually', description: 'Browse filesystem', onclick: browseForProject });

    screenCards.set(cards);
  }

  async function selectProject(project: RecentProject) {
    try {
      devLog('lifecycle', `ProjectSelect: opening ${project.name} at ${project.path}`);
      const config = await openProject(project.path);
      projectName.set(config.project.name);
      navigate('level1');
    } catch (e) {
      devError('error', 'Failed to open project', e);
      projects = projects.filter(p => p.path !== project.path);
      updateScreenCards();
    }
  }

  async function browseForProject() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });
      if (selected && typeof selected === 'string') {
        const config = await openProject(selected);
        projectName.set(config.project.name);
        navigate('level1');
      }
    } catch (e) {
      devError('error', 'Browse for project failed', e);
    }
  }

  let visibleProjects = $derived(projects.slice(0, 4));
  let hasProjects = $derived(projects.length > 0);
  let totalCount = $derived(projects.length);
  const buttons = ['A', 'B', 'X', 'Y'];
</script>

<div class="flex-1 overflow-hidden bg-background-dark">
<div class="h-full flex items-center justify-center relative">
  <div class="w-full max-w-[800px] px-8">
    <!-- Heading -->
    <div class="text-center mb-6">
      <h1 class="text-primary font-bold text-xl font-mono flex items-center justify-center gap-2 mb-3">
        <span class="material-icons text-sm">terminal</span>
        DeckForge
      </h1>
      <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
        {hasProjects ? 'Select a Project' : 'No Recent Projects'}
      </h2>
      <p class="text-xs text-slate-500">
        {#if hasProjects}
          {totalCount > 4 ? `Showing 4 of ${totalCount} projects` : 'Choose an existing project or add a new one'}
        {:else}
          Open a project folder to get started
        {/if}
      </p>
    </div>

    <!-- Project list -->
    <div class="space-y-2 mb-4">
      {#if hasProjects}
        {#each visibleProjects as project, i}
          {#if i === $selectedCardIndex}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="relative group cursor-pointer" onclick={() => selectProject(project)}>
              <div class="absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r"></div>
              <div class="bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all">
                <div class="absolute top-0 right-0 p-1.5 bg-primary text-black rounded-bl font-bold text-xs shadow-sm">{buttons[i]}</div>
                <h3 class="text-primary font-bold text-sm mb-1 pr-6 truncate">{project.name}</h3>
                <p class="text-xs text-slate-300 leading-snug mb-2">{project.tech_stack}</p>
                <div class="flex items-center gap-2 text-[10px]">
                  <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{frameworkPill(project.framework)}</span>
                  <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{timeAgo(project.last_opened)}</span>
                </div>
              </div>
            </div>
          {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="relative group opacity-80 hover:opacity-100 transition-opacity cursor-pointer" onclick={() => selectProject(project)}>
              <div class="bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative transition-colors">
                <div class="absolute top-2 right-2 w-5 h-5 flex items-center justify-center bg-slate-700 text-slate-300 border border-slate-600 rounded-full font-bold text-[10px]">{buttons[i]}</div>
                <h3 class="text-white font-medium text-sm mb-1 pr-6 truncate">{project.name}</h3>
                <p class="text-xs text-slate-400 leading-snug mb-2">{project.tech_stack}</p>
                <div class="flex items-center gap-2 text-[10px]">
                  <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">{frameworkPill(project.framework)}</span>
                  <span class="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border">{timeAgo(project.last_opened)}</span>
                </div>
              </div>
            </div>
          {/if}
        {/each}
      {:else}
        <!-- Empty state -->
        <div class="text-center py-8">
          <span class="material-icons text-slate-600 mb-3" style="font-size: 36px;">folder_off</span>
          <p class="text-xs text-slate-500 mb-4">No recent projects. Open a folder with RB or LB to get started.</p>
        </div>
      {/if}

      <div class="h-px bg-surface-border my-2"></div>

      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group" onclick={browseForProject}>
        <div class="bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600">RB</div>
            <span class="text-xs text-slate-300 font-medium">Scan for Projects</span>
          </div>
          <span class="material-icons text-slate-500 text-sm">folder_open</span>
        </div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="relative group" onclick={browseForProject}>
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
