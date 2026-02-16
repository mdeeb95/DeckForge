// ─── Rollback — safe revert using revert commits (never hard reset) ──────────

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RollbackPreview {
  target_sha: string;
  commits_to_undo: UndoCommit[];
  total_files_affected: number;
  total_insertions: number;
  total_deletions: number;
}

export interface UndoCommit {
  sha: string;
  message: string;
  relative_time: string;
}

export interface RollbackResult {
  success: boolean;
  reverted_count: number;
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

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Preview what will be undone if we rollback to the given commit.
 * Shows all commits between HEAD and the target (exclusive).
 */
export async function previewRollback(sha: string, cwd: string): Promise<RollbackPreview> {
  if (!isTauri()) {
    return {
      target_sha: sha,
      commits_to_undo: [
        { sha: 'a3f9c2d', message: '[DeckForge] Add search and filter to user list', relative_time: '5 min ago' },
        { sha: 'e7b21a0', message: '[DeckForge] Add unit tests for search logic', relative_time: '15 min ago' },
      ],
      total_files_affected: 4,
      total_insertions: 132,
      total_deletions: 12,
    };
  }

  try {
    // Get commits between target and HEAD (these will be undone)
    const logResult = await exec(
      `git log ${sha}..HEAD --format="%H|%s|%aI" 2>/dev/null`,
      cwd,
    );

    const commits_to_undo: UndoCommit[] = [];
    if (logResult.stdout.trim()) {
      for (const line of logResult.stdout.trim().split('\n')) {
        const parts = line.split('|');
        if (parts.length < 3) continue;
        commits_to_undo.push({
          sha: parts[0].substring(0, 7),
          message: parts[1],
          relative_time: getRelativeTime(parts.slice(2).join('|')),
        });
      }
    }

    // Get aggregate diff stats
    const statsResult = await exec(
      `git diff --shortstat ${sha}..HEAD 2>/dev/null || echo ""`,
      cwd,
    );
    const statsLine = statsResult.stdout.trim();
    const filesMatch = statsLine.match(/(\d+) files? changed/);
    const insMatch = statsLine.match(/(\d+) insertions?/);
    const delMatch = statsLine.match(/(\d+) deletions?/);

    return {
      target_sha: sha,
      commits_to_undo,
      total_files_affected: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      total_insertions: insMatch ? parseInt(insMatch[1], 10) : 0,
      total_deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  } catch (error) {
    console.error('[rollback] previewRollback failed:', error);
    return { target_sha: sha, commits_to_undo: [], total_files_affected: 0, total_insertions: 0, total_deletions: 0 };
  }
}

/**
 * Execute rollback to the given commit using revert commits.
 * Safety: never hard-resets. Each undone commit gets its own revert commit,
 * so the rollback itself is undoable.
 */
export async function executeRollback(sha: string, cwd: string): Promise<RollbackResult> {
  if (!isTauri()) {
    return { success: true, reverted_count: 2, message: 'Rolled back 2 commits (mock)' };
  }

  try {
    // Get the list of commits to revert (most recent first — the order git revert needs)
    const logResult = await exec(
      `git log ${sha}..HEAD --format="%H" --reverse 2>/dev/null`,
      cwd,
    );

    if (!logResult.stdout.trim()) {
      return { success: true, reverted_count: 0, message: 'Already at this commit' };
    }

    const shas = logResult.stdout.trim().split('\n').reverse();
    let reverted = 0;

    // Revert each commit individually (newest first)
    for (const commitSha of shas) {
      const revertResult = await exec(
        `git revert ${commitSha} --no-edit 2>&1`,
        cwd,
      );

      if (revertResult.code !== 0) {
        // Revert conflict — abort this revert and stop
        await exec('git revert --abort 2>/dev/null', cwd);
        return {
          success: false,
          reverted_count: reverted,
          message: `Revert conflict at ${commitSha.substring(0, 7)} after reverting ${reverted} commit${reverted !== 1 ? 's' : ''}. Remaining commits unchanged.`,
        };
      }

      reverted++;
    }

    return {
      success: true,
      reverted_count: reverted,
      message: `Rolled back ${reverted} commit${reverted !== 1 ? 's' : ''} to ${sha}`,
    };
  } catch (error) {
    return { success: false, reverted_count: 0, message: String(error) };
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
