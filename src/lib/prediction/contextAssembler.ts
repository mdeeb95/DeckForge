import type { ContextPayload } from './types';
import type { ProjectConfig, ProjectBehavior } from '../types/data';

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the full context payload for a prediction engine call.
 * Assembles data from project config, behavior store, file tree, and git history.
 * Runs locally — no LLM needed. Target: ~120ms.
 */
export async function buildContextPayload(
  config: ProjectConfig,
  behavior: ProjectBehavior | null,
): Promise<ContextPayload> {
  // Gather file tree and git history in parallel
  const [fileTree, gitHistory] = await Promise.all([
    getFileTree(config.project.path),
    getGitHistory(config.project.path),
  ]);

  const detectedFeatures = await getDetectedFeatures(config);
  const detectedGaps = getDetectedGaps(config, fileTree);

  const payload: ContextPayload = {
    project: {
      name: config.project.name,
      type_detected: config.tech_stack.type_detected,
      created_at: config.project.created_at,
      session_number: config.session_history.current_session_number,
      total_ai_tasks_completed: config.claude_code.total_tasks_completed,
    },

    file_tree: fileTree,

    git_history: gitHistory,

    detected_features: detectedFeatures,
    detected_gaps: detectedGaps,
    current_errors: [],  // populated from cached build output when available

    tech_stack: {
      framework: config.tech_stack.framework,
      build_tool: config.tech_stack.build_tool,
      language: config.tech_stack.language,
      dependencies: config.tech_stack.dependencies,
    },

    user_behavior: {
      categories_selected: behavior?.aggregate.categories_selected ?? {
        Feature: 0, Bug: 0, TechDebt: 0, Yolo: 0,
      },
      rerolls_per_session_avg: behavior?.aggregate.avg_rerolls_before_selection ?? 0,
      plans_rejected_pct: behavior?.aggregate.plans_rejected_pct ?? 0,
      last_category: behavior?.aggregate.last_category ?? null,
      preferred_complexity: behavior?.aggregate.preferred_complexity ?? 'medium',
      voice_usage_count: behavior?.aggregate.voice_usage_count ?? 0,
    },
  };

  return truncatePayload(payload);
}

// ─── File Tree ───────────────────────────────────────────────────────────────

interface FileTreeResult {
  summary: string;
  top_level: string[];
  largest_files: { path: string; lines: number }[];
  recently_modified: { path: string; modified: string }[];
}

async function getFileTree(projectPath: string): Promise<FileTreeResult> {
  if (!isTauri()) {
    return getMockFileTree();
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    // Get top-level listing
    const lsCmd = Command.create('claude', ['--help']); // placeholder
    // Use shell commands for file tree analysis
    const topLevelCmd = Command.create('ls', ['-1', projectPath]);
    const topLevelResult = await topLevelCmd.execute();
    const topLevel = topLevelResult.stdout
      .split('\n')
      .filter(Boolean)
      .filter(f => !f.startsWith('.'))
      .slice(0, 20);

    // Count files and directories
    const findCmd = Command.create('find', [
      projectPath, '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
      '-not', '-path', '*/.deckforge/*',
      '-type', 'f',
    ]);
    const findResult = await findCmd.execute();
    const allFiles = findResult.stdout.split('\n').filter(Boolean);
    const fileCount = allFiles.length;

    const dirCmd = Command.create('find', [
      projectPath, '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
      '-type', 'd',
    ]);
    const dirResult = await dirCmd.execute();
    const dirCount = dirResult.stdout.split('\n').filter(Boolean).length;

    // Get largest files (by line count)
    const largestFiles: { path: string; lines: number }[] = [];
    const codeFiles = allFiles
      .filter(f => /\.(ts|tsx|js|jsx|svelte|py|rs|go|java|css|html)$/.test(f))
      .slice(0, 50);

    for (const filePath of codeFiles.slice(0, 10)) {
      try {
        const wcCmd = Command.create('wc', ['-l', filePath]);
        const wcResult = await wcCmd.execute();
        const lines = parseInt(wcResult.stdout.trim().split(/\s+/)[0], 10);
        if (!isNaN(lines)) {
          const relativePath = filePath.replace(projectPath + '/', '');
          largestFiles.push({ path: relativePath, lines });
        }
      } catch { /* skip */ }
    }
    largestFiles.sort((a, b) => b.lines - a.lines);

    // Get recently modified files
    const recentCmd = Command.create('find', [
      projectPath, '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
      '-not', '-path', '*/.deckforge/*',
      '-type', 'f',
      '-name', '*.ts', '-o', '-name', '*.tsx', '-o', '-name', '*.js',
      '-o', '-name', '*.jsx', '-o', '-name', '*.svelte',
    ]);
    const recentResult = await recentCmd.execute();
    const recentFiles = recentResult.stdout.split('\n').filter(Boolean).slice(0, 5);
    const recentlyModified = recentFiles.map(f => ({
      path: f.replace(projectPath + '/', ''),
      modified: 'recently',
    }));

    return {
      summary: `${fileCount} files, ${dirCount} directories`,
      top_level: topLevel,
      largest_files: largestFiles.slice(0, 5),
      recently_modified: recentlyModified,
    };
  } catch (error) {
    console.error('Failed to read file tree:', error);
    return getMockFileTree();
  }
}

function getMockFileTree(): FileTreeResult {
  return {
    summary: '47 files, 12 directories',
    top_level: ['package.json', 'src/', 'public/', 'tests/', 'tsconfig.json', 'vite.config.ts'],
    largest_files: [
      { path: 'src/App.tsx', lines: 187 },
      { path: 'src/components/NoteList.tsx', lines: 142 },
      { path: 'src/store/noteStore.ts', lines: 98 },
    ],
    recently_modified: [
      { path: 'src/components/NoteEditor.tsx', modified: '2 tasks ago' },
      { path: 'src/App.tsx', modified: '1 task ago' },
    ],
  };
}

// ─── Git History ─────────────────────────────────────────────────────────────

interface GitHistoryResult {
  recent_commits: { message: string; files_changed: number }[];
  current_branch: string;
  uncommitted_changes: boolean;
  total_deckforge_commits: number;
}

async function getGitHistory(projectPath: string): Promise<GitHistoryResult> {
  if (!isTauri()) {
    return getMockGitHistory();
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    // Get recent commits
    const logCmd = Command.create('git', [
      '-C', projectPath,
      'log', '--oneline', '--format=%s|%H', '-10',
    ]);
    const logResult = await logCmd.execute();
    const commits = logResult.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [message] = line.split('|');
        return { message: message ?? '', files_changed: 0 };
      });

    // Get current branch
    const branchCmd = Command.create('git', [
      '-C', projectPath,
      'rev-parse', '--abbrev-ref', 'HEAD',
    ]);
    const branchResult = await branchCmd.execute();
    const currentBranch = branchResult.stdout.trim() || 'main';

    // Check for uncommitted changes
    const statusCmd = Command.create('git', [
      '-C', projectPath,
      'status', '--porcelain',
    ]);
    const statusResult = await statusCmd.execute();
    const uncommittedChanges = statusResult.stdout.trim().length > 0;

    // Count DeckForge commits
    const dfLogCmd = Command.create('git', [
      '-C', projectPath,
      'log', '--oneline', '--grep=\\[DeckForge\\]',
    ]);
    const dfLogResult = await dfLogCmd.execute();
    const totalDeckforgeCommits = dfLogResult.stdout
      .split('\n')
      .filter(Boolean)
      .length;

    return {
      recent_commits: commits,
      current_branch: currentBranch,
      uncommitted_changes: uncommittedChanges,
      total_deckforge_commits: totalDeckforgeCommits,
    };
  } catch (error) {
    console.error('Failed to read git history:', error);
    return getMockGitHistory();
  }
}

function getMockGitHistory(): GitHistoryResult {
  return {
    recent_commits: [
      { message: 'Add note editing with markdown support', files_changed: 3 },
      { message: 'Add note creation and listing', files_changed: 5 },
      { message: 'Initial project setup with React', files_changed: 8 },
    ],
    current_branch: 'main',
    uncommitted_changes: false,
    total_deckforge_commits: 3,
  };
}

// ─── Feature Detection ───────────────────────────────────────────────────────

async function getDetectedFeatures(config: ProjectConfig): Promise<string[]> {
  // Use features_detected from project config (populated from DeckForge auto-commits)
  const features = config.features_detected.map(f => f.summary);

  // If we have no DeckForge-detected features, use mock data in dev
  if (features.length === 0 && !isTauri()) {
    return [
      'note creation',
      'note listing',
      'note editing',
      'markdown rendering',
    ];
  }

  return features;
}

// ─── Gap Detection (Rule-Based Heuristics) ───────────────────────────────────

function getDetectedGaps(config: ProjectConfig, fileTree: FileTreeResult): string[] {
  const gaps: string[] = [];
  const framework = config.tech_stack.framework.toLowerCase();
  const files = fileTree.top_level.map(f => f.toLowerCase());

  // Universal gaps
  if (!files.some(f => f.includes('test') || f.includes('spec') || f === '__tests__')) {
    gaps.push('no tests detected');
  }
  if (!files.includes('readme.md')) {
    gaps.push('no README');
  }
  if (!files.includes('.gitignore')) {
    gaps.push('no .gitignore');
  }

  // Check for large files
  const largeFiles = fileTree.largest_files.filter(f => f.lines > 300);
  if (largeFiles.length > 0) {
    gaps.push(`${largeFiles.length} file(s) over 300 lines — consider splitting`);
  }

  // Node/React/Vue/Svelte specific
  if (framework.includes('react') || framework.includes('vue') || framework.includes('svelte') || framework.includes('next')) {
    if (!files.some(f => f.includes('.env'))) {
      gaps.push('no .env file for environment variables');
    }
    if (config.tech_stack.dependencies.length > 0 && !config.tech_stack.dependencies.some(d =>
      d.includes('jest') || d.includes('vitest') || d.includes('mocha') || d.includes('testing'))) {
      gaps.push('no test framework in dependencies');
    }
  }

  // Python specific
  if (framework.includes('django') || framework.includes('flask') || framework.includes('fastapi') ||
      config.tech_stack.language.toLowerCase() === 'python') {
    if (!files.includes('requirements.txt') && !files.includes('pyproject.toml')) {
      gaps.push('no requirements file');
    }
  }

  return gaps.slice(0, 8);  // Cap at 8
}

// ─── Payload Truncation (Section 2.4) ────────────────────────────────────────

/**
 * Truncate payload fields in priority order to stay under ~2000 token budget.
 * Lowest priority trimmed first. Uses rough estimate of 1 token ≈ 4 chars.
 */
function truncatePayload(payload: ContextPayload): ContextPayload {
  const MAX_CHARS = 8000;  // ~2000 tokens * 4 chars/token

  let serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_CHARS) return payload;

  // Priority 1 (lowest): truncate current_errors
  if (payload.current_errors.length > 2) {
    payload.current_errors = payload.current_errors.slice(0, 2);
    payload.current_errors = payload.current_errors.map(e =>
      e.split('\n').slice(0, 2).join('\n')
    );
  }

  serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_CHARS) return payload;

  // Priority 2: reduce recent_commits from 10 to 5
  if (payload.git_history.recent_commits.length > 5) {
    payload.git_history.recent_commits = payload.git_history.recent_commits.slice(0, 5);
  }

  serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_CHARS) return payload;

  // Priority 3: reduce top_level from 20 to 10
  if (payload.file_tree.top_level.length > 10) {
    payload.file_tree.top_level = payload.file_tree.top_level.slice(0, 10);
  }

  serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_CHARS) return payload;

  // Priority 4: reduce detected_gaps from 8 to 4
  if (payload.detected_gaps.length > 4) {
    payload.detected_gaps = payload.detected_gaps.slice(0, 4);
  }

  serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_CHARS) return payload;

  // Priority 5 (highest - trimmed last): reduce detected_features from 15 to 8
  if (payload.detected_features.length > 8) {
    payload.detected_features = payload.detected_features.slice(0, 8);
  }

  return payload;
}

// ─── Hash Computation ────────────────────────────────────────────────────────

/**
 * Compute a lightweight hash for cache invalidation.
 * Different hash per category per the prediction engine doc section 7.1.
 */
export function computeFeaturesHash(payload: ContextPayload): string {
  const input = JSON.stringify({
    features: payload.detected_features,
    tree: payload.file_tree.summary,
    gaps: payload.detected_gaps,
  });
  return simpleHash(input);
}

export function computeErrorsHash(payload: ContextPayload): string {
  const input = JSON.stringify({
    errors: payload.current_errors,
    recent: payload.file_tree.recently_modified,
  });
  return simpleHash(input);
}

export function computeQualityHash(payload: ContextPayload): string {
  const input = JSON.stringify({
    largest: payload.file_tree.largest_files,
    deps: payload.tech_stack.dependencies,
  });
  return simpleHash(input);
}

export function computeCategoryHash(
  category: string,
  payload: ContextPayload,
): string {
  switch (category) {
    case 'feature': return computeFeaturesHash(payload);
    case 'bug': return computeErrorsHash(payload);
    case 'tech_debt': return computeQualityHash(payload);
    default: return computeFeaturesHash(payload);
  }
}

/**
 * Simple string hash (djb2). Not cryptographic, just for cache invalidation.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
