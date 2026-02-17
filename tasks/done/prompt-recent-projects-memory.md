# Task: Recent Projects Memory — Persistent Project List

## Goal

When the user opens DeckForge, they should see their real recently-opened projects on the ProjectSelectScreen — not hardcoded demo data. Every call to `openProject()` should record the project in a persistent `recent_projects` list inside `~/.config/deckforge/global.json`. ProjectSelectScreen reads this list and renders it, sorted by `last_opened` descending.

Currently ProjectSelectScreen.svelte has 4 hardcoded fake projects (`neo-dashboard-v2`, `api-gateway-rust`, etc.) and navigates to `level1` with no actual project loading. This needs to become a real, data-driven screen.

## Architecture

### Data Model Change

Add a `recent_projects` array to `GlobalConfig` in `src/lib/types/data.ts`:

```typescript
export interface GlobalConfig {
  // ... existing fields ...

  recent_projects: RecentProject[];
}

export interface RecentProject {
  path: string;          // Absolute path to project root
  name: string;          // Display name (folder name or project.name)
  last_opened: string;   // ISO timestamp
  tech_stack: string;    // e.g. "Svelte + TypeScript" — snapshot from last open
  framework: string;     // e.g. "svelte" — for icon/pill display
}
```

**Cap at 20 entries.** If a project is opened that's already in the list, update its `last_opened` and `tech_stack` — don't duplicate it. If the list exceeds 20, drop the oldest.

### Default Value

In `src/lib/data/defaults.ts`, add `recent_projects: []` to `createDefaultGlobalConfig()`.

### Recording Projects

In `src/lib/stores/configStores.ts`, modify `openProject()` to record the project after successful load:

```typescript
export async function openProject(projectPath: string): Promise<ProjectConfig> {
  // ... existing load + detect logic ...

  projectConfig.set(config);

  // Record in recent projects
  await updateGlobalConfig((global) => {
    const entry: RecentProject = {
      path: projectPath,
      name: config.project.name,
      last_opened: new Date().toISOString(),
      tech_stack: [config.tech_stack.framework, config.tech_stack.language]
        .filter(Boolean)
        .join(' + ') || config.tech_stack.type_detected || 'Unknown',
      framework: config.tech_stack.framework || '',
    };

    // Remove existing entry for this path (dedup)
    const filtered = global.recent_projects.filter(p => p.path !== projectPath);
    // Prepend new entry, cap at 20
    return {
      ...global,
      recent_projects: [entry, ...filtered].slice(0, 20),
    };
  });

  return config;
}
```

**Import `RecentProject`** from `../types/data` at the top of configStores.ts.

### ProjectSelectScreen.svelte — Full Rewrite

Replace the hardcoded projects with a reactive data-driven screen.

**Script section:**

```typescript
import { globalConfig, openProject } from '../stores/configStores';
import { selectedCardIndex, navigate, screenCards, projectName } from '../stores/app';
import { exists } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { onMount } from 'svelte';
import type { RecentProject } from '../types/data';

let projects: RecentProject[] = [];
let validating = true;

onMount(async () => {
  const config = $globalConfig;
  if (config?.recent_projects?.length) {
    // Validate paths still exist (don't block UI — validate in background)
    projects = config.recent_projects;
    validating = false;

    // Background validation: mark missing projects
    for (const p of projects) {
      try {
        const pathExists = await exists(p.path);
        if (!pathExists) {
          projects = projects.filter(pr => pr.path !== p.path);
        }
      } catch {
        // Skip validation errors silently
      }
    }
  } else {
    validating = false;
  }

  updateScreenCards();
});

function updateScreenCards() {
  const buttons = ['A', 'B', 'X', 'Y'];
  const visibleProjects = projects.slice(0, 4);

  screenCards.set(visibleProjects.map((p, i) => ({
    button: buttons[i],
    title: p.name,
    description: p.tech_stack,
    onclick: () => selectProject(p),
  })));
}

async function selectProject(project: RecentProject) {
  try {
    const config = await openProject(project.path);
    projectName.set(config.project.name);
    navigate('level1');
  } catch (e) {
    console.error('Failed to open project:', e);
    // Remove stale project from list
    projects = projects.filter(p => p.path !== project.path);
    updateScreenCards();
  }
}

async function browseForProject() {
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
}
```

**Template section:**

The template should keep the exact same visual structure (selected card with cyan accent bar, unselected cards with surface-dark bg, button badges, pills) but render from the `projects` array instead of hardcoded data.

Key changes:
- Show up to 4 recent projects as A/B/X/Y cards (same styling as current)
- Pills should show: framework-derived pill (e.g. "Svelte", "Rust") + relative time since `last_opened` (e.g. "2h ago", "3d ago")
- If `projects.length === 0`, show an empty state message: "No recent projects" with the browse button prominently displayed
- Keep the "Scan for Projects" (RB) button but wire it to `browseForProject()`
- Keep the "Add Project Manually" (LB) button and also wire it to `browseForProject()`
- If there are more than 4 projects, add a "More Projects" secondary card or just show the first 4 (keep it simple for now — 4 slots match 4 face buttons)

**Relative time helper** — create a small utility or inline it:

```typescript
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
```

### EmptyStateScreen.svelte — Wire Browse

EmptyStateScreen already calls `openProject()` via `openDirectory()`. After `openProject()` succeeds, the recent projects list will be automatically updated (because we modified `openProject()` above). No extra changes needed here — just verify it still works.

### Gamepad Navigation

ProjectSelectScreen must work with the existing gamepad system:
- D-pad up/down moves `selectedCardIndex` through the project cards
- A button on a selected card calls `selectProject()`
- RB calls `browseForProject()`
- B navigates back (or does nothing if this is the root screen)

The existing `screenCards` store integration should handle this — the cards are already registered via `screenCards.set()`.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/types/data.ts` | Add `RecentProject` interface, add `recent_projects` to `GlobalConfig` |
| `src/lib/data/defaults.ts` | Add `recent_projects: []` to default global config |
| `src/lib/stores/configStores.ts` | Record project in `openProject()`, import `RecentProject` |
| `src/lib/screens/ProjectSelectScreen.svelte` | Full rewrite — data-driven from `globalConfig.recent_projects` |

## What NOT to Change

- EmptyStateScreen.svelte — already works, just verify it
- The visual card design — keep the exact same card styling (cyan accent, button badges, pills)
- Global config schema version — bump to 2 only if you add a migration, otherwise leave at 1 and just default the missing field

## Edge Cases

1. **First launch** — `recent_projects` is `[]`, show empty state with prominent browse button
2. **Deleted project folder** — background validation removes stale entries, card disappears
3. **Same project opened twice** — dedup by path, update `last_opened`
4. **More than 4 projects** — show first 4 (most recent), add a note like "4 of 12 projects" if needed
5. **Non-Tauri mode (dev)** — gracefully show empty list, browse button won't work

## Verification

1. Open DeckForge fresh — should show empty ProjectSelectScreen with browse button
2. Browse to a project folder → opens project → navigate back to ProjectSelectScreen → project now appears in list
3. Open a second project → both appear, most recent first
4. Close and reopen DeckForge → projects are still there (persisted in global.json)
5. Delete a project folder → reopen DeckForge → stale project is removed from list
6. Gamepad: D-pad selects projects, A opens them, RB opens file browser
