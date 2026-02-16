// ─── Git Operations via Tauri Shell ──────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string;
  commits_ahead: number;
  files_changed: number;
  has_conflicts: boolean;
}

export interface UnpushedCommit {
  sha: string;
  message: string;
  timestamp: string;
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface MergeResult {
  success: boolean;
  conflicts: string[];
  message: string;
}

export interface PushResult {
  success: boolean;
  remote_url: string;
  message: string;
}

export interface PRResult {
  success: boolean;
  url: string;
  method: 'gh_cli' | 'push_only';
  message: string;
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

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_STATUS: GitStatus = {
  branch: 'feat/search-module',
  commits_ahead: 3,
  files_changed: 5,
  has_conflicts: false,
};

const MOCK_COMMITS: UnpushedCommit[] = [
  { sha: 'a3f9c2d', message: 'feat: add search and filter to user list', timestamp: '2 min ago', files_changed: 3, insertions: 87, deletions: 12 },
  { sha: 'e7b21a0', message: 'test: add unit tests for search logic', timestamp: '5 min ago', files_changed: 1, insertions: 45, deletions: 0 },
  { sha: '1d04f8e', message: 'refactor: extract SearchInput component', timestamp: '8 min ago', files_changed: 2, insertions: 32, deletions: 18 },
];

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getGitStatus(cwd: string): Promise<GitStatus> {
  if (!isTauri()) return MOCK_STATUS;

  try {
    const [statusResult, aheadResult, branchResult] = await Promise.all([
      exec('git status --porcelain', cwd),
      exec('git rev-list --count @{upstream}..HEAD 2>/dev/null || echo 0', cwd),
      exec('git rev-parse --abbrev-ref HEAD', cwd),
    ]);

    const porcelain = statusResult.stdout.trim();
    const lines = porcelain ? porcelain.split('\n') : [];
    const has_conflicts = lines.some(l => l.startsWith('UU'));
    const files_changed = lines.filter(l => l.trim().length > 0).length;

    return {
      branch: branchResult.stdout.trim(),
      commits_ahead: parseInt(aheadResult.stdout.trim(), 10) || 0,
      files_changed,
      has_conflicts,
    };
  } catch (error) {
    console.error('[git] getGitStatus failed:', error);
    return { branch: 'unknown', commits_ahead: 0, files_changed: 0, has_conflicts: false };
  }
}

export async function getUnpushedCommits(cwd: string): Promise<UnpushedCommit[]> {
  if (!isTauri()) return MOCK_COMMITS;

  try {
    const logResult = await exec(
      'git log @{upstream}..HEAD --format="%H|%s|%aI" 2>/dev/null',
      cwd,
    );

    if (!logResult.stdout.trim()) return [];

    const logLines = logResult.stdout.trim().split('\n');
    const commits: UnpushedCommit[] = [];

    for (const line of logLines) {
      const [sha, message, timestamp] = line.split('|');
      if (!sha) continue;

      const shortSha = sha.substring(0, 7);
      // Get per-commit stats
      const statResult = await exec(
        `git diff --shortstat ${sha}^..${sha} 2>/dev/null || echo ""`,
        cwd,
      );

      let insertions = 0;
      let deletions = 0;
      let files_changed = 0;
      const statLine = statResult.stdout.trim();
      if (statLine) {
        const filesMatch = statLine.match(/(\d+) files? changed/);
        const insMatch = statLine.match(/(\d+) insertions?/);
        const delMatch = statLine.match(/(\d+) deletions?/);
        files_changed = filesMatch ? parseInt(filesMatch[1], 10) : 0;
        insertions = insMatch ? parseInt(insMatch[1], 10) : 0;
        deletions = delMatch ? parseInt(delMatch[1], 10) : 0;
      }

      const ago = getRelativeTime(timestamp);
      commits.push({ sha: shortSha, message, timestamp: ago, files_changed, insertions, deletions });
    }

    return commits;
  } catch (error) {
    console.error('[git] getUnpushedCommits failed:', error);
    return [];
  }
}

export async function getDiff(cwd: string): Promise<string> {
  if (!isTauri()) return `diff --git a/src/Search.tsx b/src/Search.tsx
index 1234567..abcdefg 100644
--- a/src/Search.tsx
+++ b/src/Search.tsx
@@ -1,5 +1,15 @@
+import { useState } from 'react';
+
 export function Search() {
-  return <div>TODO</div>;
+  const [query, setQuery] = useState('');
+  return (
+    <input
+      value={query}
+      onChange={e => setQuery(e.target.value)}
+      placeholder="Search..."
+    />
+  );
 }`;

  try {
    const result = await exec('git diff @{upstream}..HEAD 2>/dev/null || git diff HEAD', cwd);
    return result.stdout || 'No diff available.';
  } catch {
    return 'Failed to get diff.';
  }
}

export async function getInsertionsDeletions(cwd: string): Promise<{ insertions: number; deletions: number }> {
  if (!isTauri()) return { insertions: 164, deletions: 30 };

  try {
    const result = await exec('git diff --shortstat @{upstream}..HEAD 2>/dev/null || echo ""', cwd);
    const line = result.stdout.trim();
    const insMatch = line.match(/(\d+) insertions?/);
    const delMatch = line.match(/(\d+) deletions?/);
    return {
      insertions: insMatch ? parseInt(insMatch[1], 10) : 0,
      deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  } catch {
    return { insertions: 0, deletions: 0 };
  }
}

export async function mergeBranch(source: string, target: string, cwd: string): Promise<MergeResult> {
  if (!isTauri()) {
    return { success: true, conflicts: [], message: `Merged ${source} into ${target}` };
  }

  try {
    const checkoutResult = await exec(`git checkout ${target}`, cwd);
    if (checkoutResult.code !== 0) {
      return { success: false, conflicts: [], message: `Failed to checkout ${target}: ${checkoutResult.stderr}` };
    }

    const mergeResult = await exec(`git merge ${source} --no-ff`, cwd);
    if (mergeResult.code !== 0) {
      // Merge conflict — abort
      const conflictResult = await exec('git diff --name-only --diff-filter=U', cwd);
      const conflicts = conflictResult.stdout.trim().split('\n').filter(Boolean);
      await exec('git merge --abort', cwd);
      await exec(`git checkout ${source}`, cwd);
      return { success: false, conflicts, message: 'Merge conflicts detected — merge aborted' };
    }

    return { success: true, conflicts: [], message: mergeResult.stdout || `Merged ${source} into ${target}` };
  } catch (error) {
    return { success: false, conflicts: [], message: String(error) };
  }
}

export async function pushBranch(branch: string, cwd: string): Promise<PushResult> {
  if (!isTauri()) {
    return { success: true, remote_url: 'https://github.com/user/repo', message: `Pushed ${branch} to origin` };
  }

  try {
    const result = await exec(`git push -u origin ${branch}`, cwd);
    const success = result.code === 0;
    const remoteResult = await exec('git remote get-url origin 2>/dev/null || echo ""', cwd);
    return {
      success,
      remote_url: remoteResult.stdout.trim(),
      message: success ? `Pushed ${branch} to origin` : result.stderr,
    };
  } catch (error) {
    return { success: false, remote_url: '', message: String(error) };
  }
}

export async function createPR(title: string, body: string, cwd: string): Promise<PRResult> {
  if (!isTauri()) {
    return { success: true, url: 'https://github.com/user/repo/pull/42', method: 'gh_cli', message: 'PR created (mock)' };
  }

  try {
    // Check if gh CLI is available
    const whichResult = await exec('which gh 2>/dev/null', cwd);
    if (whichResult.code === 0 && whichResult.stdout.trim()) {
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedBody = body.replace(/"/g, '\\"');
      const prResult = await exec(`gh pr create --title "${escapedTitle}" --body "${escapedBody}"`, cwd);
      if (prResult.code === 0) {
        const url = prResult.stdout.trim();
        return { success: true, url, method: 'gh_cli', message: `PR created: ${url}` };
      }
      return { success: false, url: '', method: 'gh_cli', message: prResult.stderr };
    }

    // Fallback: just push
    return { success: true, url: '', method: 'push_only', message: 'gh CLI not available — branch pushed, create PR manually' };
  } catch (error) {
    return { success: false, url: '', method: 'push_only', message: String(error) };
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  if (!isTauri()) return 'feat/search-module';

  try {
    const result = await exec('git rev-parse --abbrev-ref HEAD', cwd);
    return result.stdout.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
