// ─── Timeline — read git history for [DeckForge]-tagged commits ──────────────

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  sha: string;
  message: string;
  timestamp: string;
  relative_time: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  is_current: boolean;
}

// ─── Tauri detection ────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function exec(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const command = Command.create('sh', ['-c', cmd], { cwd });
  const result = await command.execute();
  return { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 1 };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the timeline of [DeckForge]-tagged commits for the project.
 * Returns most recent first.
 */
export async function getTimeline(projectPath: string): Promise<TimelineEntry[]> {
  if (!isTauri()) return mockTimeline();

  try {
    // Get all commits with [DeckForge] in the message
    const logResult = await exec(
      'git log --all --format="%H|%s|%aI" --grep="\\[DeckForge\\]" -50 2>/dev/null',
      projectPath,
    );

    if (!logResult.stdout.trim()) {
      // Fallback: show recent commits if no DeckForge-tagged ones exist
      return getRecentCommits(projectPath);
    }

    const lines = logResult.stdout.trim().split('\n');
    const headResult = await exec('git rev-parse HEAD', projectPath);
    const headSha = headResult.stdout.trim();

    const entries: TimelineEntry[] = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 3) continue;

      const sha = parts[0];
      const message = parts[1];
      const timestamp = parts.slice(2).join('|'); // ISO timestamp may contain |

      const shortSha = sha.substring(0, 7);
      const stats = await getCommitStats(sha, projectPath);

      entries.push({
        sha: shortSha,
        message,
        timestamp,
        relative_time: getRelativeTime(timestamp),
        files_changed: stats.files,
        insertions: stats.insertions,
        deletions: stats.deletions,
        is_current: sha === headSha,
      });
    }

    return entries;
  } catch (error) {
    console.error('[timeline] getTimeline failed:', error);
    return [];
  }
}

/**
 * Get the diff for a specific commit.
 */
export async function getCommitDiff(sha: string, projectPath: string): Promise<string> {
  if (!isTauri()) {
    return `commit ${sha}
Author: DeckForge User
Date:   just now

    [DeckForge] Add search and filter functionality

diff --git a/src/Search.tsx b/src/Search.tsx
new file mode 100644
--- /dev/null
+++ b/src/Search.tsx
@@ -0,0 +1,12 @@
+import { useState } from 'react';
+
+export function Search() {
+  const [query, setQuery] = useState('');
+  return (
+    <input
+      value={query}
+      onChange={e => setQuery(e.target.value)}
+      placeholder="Search..."
+    />
+  );
+}`;
  }

  try {
    const result = await exec(`git show ${sha} --stat --patch 2>/dev/null`, projectPath);
    return result.stdout || 'No diff available.';
  } catch {
    return 'Failed to get commit diff.';
  }
}

// ─── Fallback: recent commits (if no DeckForge tags) ────────────────────────

async function getRecentCommits(projectPath: string): Promise<TimelineEntry[]> {
  try {
    const logResult = await exec(
      'git log --format="%H|%s|%aI" -20 2>/dev/null',
      projectPath,
    );

    if (!logResult.stdout.trim()) return [];

    const lines = logResult.stdout.trim().split('\n');
    const headResult = await exec('git rev-parse HEAD', projectPath);
    const headSha = headResult.stdout.trim();

    const entries: TimelineEntry[] = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 3) continue;

      const sha = parts[0];
      const message = parts[1];
      const timestamp = parts.slice(2).join('|');

      const shortSha = sha.substring(0, 7);
      const stats = await getCommitStats(sha, projectPath);

      entries.push({
        sha: shortSha,
        message,
        timestamp,
        relative_time: getRelativeTime(timestamp),
        files_changed: stats.files,
        insertions: stats.insertions,
        deletions: stats.deletions,
        is_current: sha === headSha,
      });
    }

    return entries;
  } catch {
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getCommitStats(sha: string, cwd: string): Promise<{ files: number; insertions: number; deletions: number }> {
  try {
    const result = await exec(`git diff --shortstat ${sha}^..${sha} 2>/dev/null || echo ""`, cwd);
    const line = result.stdout.trim();
    if (!line) return { files: 0, insertions: 0, deletions: 0 };

    const filesMatch = line.match(/(\d+) files? changed/);
    const insMatch = line.match(/(\d+) insertions?/);
    const delMatch = line.match(/(\d+) deletions?/);

    return {
      files: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      insertions: insMatch ? parseInt(insMatch[1], 10) : 0,
      deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  } catch {
    return { files: 0, insertions: 0, deletions: 0 };
  }
}

function getRelativeTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } catch {
    return isoTimestamp;
  }
}

// ─── Mock data ──────────────────────────────────────────────────────────────

function mockTimeline(): TimelineEntry[] {
  return [
    {
      sha: 'a3f9c2d',
      message: '[DeckForge] Add search and filter to user list',
      timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
      relative_time: '5 min ago',
      files_changed: 3,
      insertions: 87,
      deletions: 12,
      is_current: true,
    },
    {
      sha: 'e7b21a0',
      message: '[DeckForge] Add unit tests for search logic',
      timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
      relative_time: '15 min ago',
      files_changed: 1,
      insertions: 45,
      deletions: 0,
      is_current: false,
    },
    {
      sha: '1d04f8e',
      message: '[DeckForge] Extract SearchInput component',
      timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
      relative_time: '30 min ago',
      files_changed: 2,
      insertions: 32,
      deletions: 18,
      is_current: false,
    },
    {
      sha: 'b8c3a1f',
      message: '[DeckForge] Add dark mode support',
      timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
      relative_time: '1 hr ago',
      files_changed: 4,
      insertions: 120,
      deletions: 35,
      is_current: false,
    },
    {
      sha: '5e2d7c9',
      message: '[DeckForge] Initial project setup',
      timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
      relative_time: '2 hr ago',
      files_changed: 8,
      insertions: 340,
      deletions: 0,
      is_current: false,
    },
  ];
}
