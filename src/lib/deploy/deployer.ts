// ─── Deploy Orchestration Layer ──────────────────────────────────────────────

import type { DeployProvider, BranchStrategy } from '../types/data';
import { getGitStatus, getCurrentBranch, mergeBranch, pushBranch, createPR } from './git';
import { getProvider, type OutputCallback, type DeployResult } from './providers';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PreflightCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface DeploySection {
  provider: DeployProvider;
  branch_strategy: BranchStrategy;
  target_branch: string;
}

interface DetectResult {
  provider: DeployProvider;
  source: string;
}

// ─── Tauri detection ────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

async function exec(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const { Command } = await import('@tauri-apps/plugin-shell');
  const command = Command.create('sh', ['-c', cmd], { cwd });
  const result = await command.execute();
  return { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 1 };
}

// ─── Detect deploy config ───────────────────────────────────────────────────

export async function detectDeployConfig(projectPath: string): Promise<DetectResult> {
  if (!isTauri()) {
    return { provider: 'vercel', source: 'mock' };
  }

  try {
    const { exists } = await import('@tauri-apps/plugin-fs');

    if (await exists(joinPath(projectPath, 'vercel.json'))) {
      return { provider: 'vercel', source: 'vercel.json' };
    }

    if (await exists(joinPath(projectPath, 'railway.toml'))) {
      return { provider: 'railway', source: 'railway.toml' };
    }

    if (await exists(joinPath(projectPath, 'railway.json'))) {
      return { provider: 'railway', source: 'railway.json' };
    }

    if (await exists(joinPath(projectPath, 'netlify.toml'))) {
      return { provider: 'netlify', source: 'netlify.toml' };
    }

    if (await exists(joinPath(projectPath, '.github/workflows'))) {
      return { provider: 'github_pages', source: '.github/workflows' };
    }
  } catch (error) {
    console.error('[deployer] detectDeployConfig failed:', error);
  }

  return { provider: null, source: '' };
}

// ─── Preflight checks ──────────────────────────────────────────────────────

export async function runPreflightChecks(cwd: string): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];

  if (!isTauri()) {
    // Mock preflight checks
    return [
      { label: 'No merge conflicts', passed: true, detail: 'All 12 tests passing' },
      { label: 'Tests passing', passed: true, detail: 'All 12 tests passing' },
      { label: 'Lint clean', passed: true, detail: 'No lint errors' },
      { label: 'TypeScript clean', passed: true, detail: 'TypeScript compilation clean' },
      { label: 'Branch up to date', passed: true, detail: 'No merge conflicts with main' },
    ];
  }

  // 1. No merge conflicts
  try {
    const status = await getGitStatus(cwd);
    checks.push({
      label: 'No merge conflicts',
      passed: !status.has_conflicts,
      detail: status.has_conflicts ? 'Merge conflicts detected' : 'No merge conflicts',
    });
  } catch {
    checks.push({ label: 'No merge conflicts', passed: false, detail: 'Could not check' });
  }

  // 2. Tests passing (only if scripts.test exists in package.json)
  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    const pkgPath = joinPath(cwd, 'package.json');
    if (await exists(pkgPath)) {
      const pkg = JSON.parse(await readTextFile(pkgPath));
      if (pkg.scripts?.test) {
        const result = await exec('npm test 2>&1', cwd);
        checks.push({
          label: 'Tests passing',
          passed: result.code === 0,
          detail: result.code === 0 ? 'All tests passing' : 'Tests failed',
        });
      }
    }
  } catch {
    checks.push({ label: 'Tests passing', passed: false, detail: 'Could not run tests' });
  }

  // 3. Lint clean (only if scripts.lint exists)
  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    const pkgPath = joinPath(cwd, 'package.json');
    if (await exists(pkgPath)) {
      const pkg = JSON.parse(await readTextFile(pkgPath));
      if (pkg.scripts?.lint) {
        const result = await exec('npm run lint 2>&1', cwd);
        checks.push({
          label: 'Lint clean',
          passed: result.code === 0,
          detail: result.code === 0 ? 'No lint errors' : 'Lint errors found',
        });
      }
    }
  } catch {
    checks.push({ label: 'Lint clean', passed: false, detail: 'Could not run lint' });
  }

  // 4. TypeScript clean (only if tsconfig.json exists)
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    if (await exists(joinPath(cwd, 'tsconfig.json'))) {
      const result = await exec('npx tsc --noEmit 2>&1', cwd);
      checks.push({
        label: 'TypeScript clean',
        passed: result.code === 0,
        detail: result.code === 0 ? 'TypeScript compilation clean' : 'TypeScript errors found',
      });
    }
  } catch {
    checks.push({ label: 'TypeScript clean', passed: false, detail: 'Could not check TypeScript' });
  }

  // 5. Branch up to date
  try {
    const result = await exec('git fetch --dry-run 2>&1', cwd);
    const upToDate = !result.stderr.trim() && !result.stdout.trim();
    checks.push({
      label: 'Branch up to date',
      passed: upToDate,
      detail: upToDate ? 'Branch is up to date with remote' : 'Remote has new changes',
    });
  } catch {
    checks.push({ label: 'Branch up to date', passed: true, detail: 'Could not check remote' });
  }

  return checks;
}

// ─── Deploy orchestration ───────────────────────────────────────────────────

export async function pushAndDeploy(
  deploySection: DeploySection,
  cwd: string,
  onOutput: OutputCallback,
): Promise<DeployResult> {
  const branch = await getCurrentBranch(cwd);
  const provider = getProvider(deploySection.provider);

  if (deploySection.branch_strategy === 'merge_to_main') {
    onOutput(`→ Merging ${branch} into ${deploySection.target_branch}...`);
    const mergeResult = await mergeBranch(branch, deploySection.target_branch, cwd);
    if (!mergeResult.success) {
      onOutput(`✗ ${mergeResult.message}`);
      if (mergeResult.conflicts.length > 0) {
        onOutput(`  Conflicts: ${mergeResult.conflicts.join(', ')}`);
      }
      return { success: false, url: '', preview_url: null, duration_seconds: 0, message: mergeResult.message };
    }
    onOutput(`✓ ${mergeResult.message}`);

    onOutput(`→ Pushing ${deploySection.target_branch} to origin...`);
    const pushResult = await pushBranch(deploySection.target_branch, cwd);
    if (!pushResult.success) {
      onOutput(`✗ ${pushResult.message}`);
      return { success: false, url: '', preview_url: null, duration_seconds: 0, message: pushResult.message };
    }
    onOutput(`✓ ${pushResult.message}`);
  } else if (deploySection.branch_strategy === 'pr') {
    onOutput(`→ Pushing ${branch} to origin...`);
    const pushResult = await pushBranch(branch, cwd);
    if (!pushResult.success) {
      onOutput(`✗ ${pushResult.message}`);
      return { success: false, url: '', preview_url: null, duration_seconds: 0, message: pushResult.message };
    }
    onOutput(`✓ ${pushResult.message}`);

    onOutput('→ Creating PR...');
    const prResult = await createPR(`Deploy: ${branch}`, `Auto-deploy from DeckForge`, cwd);
    onOutput(prResult.success ? `✓ ${prResult.message}` : `✗ ${prResult.message}`);
  } else {
    // direct_push
    onOutput(`→ Pushing ${branch} to origin...`);
    const pushResult = await pushBranch(branch, cwd);
    if (!pushResult.success) {
      onOutput(`✗ ${pushResult.message}`);
      return { success: false, url: '', preview_url: null, duration_seconds: 0, message: pushResult.message };
    }
    onOutput(`✓ ${pushResult.message}`);
  }

  onOutput(`→ Deploying via ${provider.name}...`);
  return provider.deploy(cwd, onOutput);
}

export async function previewDeploy(
  deploySection: DeploySection,
  cwd: string,
  onOutput: OutputCallback,
): Promise<DeployResult> {
  const branch = await getCurrentBranch(cwd);
  const provider = getProvider(deploySection.provider);

  onOutput(`→ Pushing ${branch} to origin...`);
  const pushResult = await pushBranch(branch, cwd);
  if (!pushResult.success) {
    onOutput(`✗ ${pushResult.message}`);
    return { success: false, url: '', preview_url: null, duration_seconds: 0, message: pushResult.message };
  }
  onOutput(`✓ ${pushResult.message}`);

  onOutput(`→ Deploying preview via ${provider.name}...`);
  return provider.deployPreview(cwd, onOutput);
}

export async function pushOnly(
  deploySection: DeploySection,
  cwd: string,
  onOutput: OutputCallback,
): Promise<DeployResult> {
  const branch = await getCurrentBranch(cwd);

  onOutput(`→ Pushing ${branch} to origin...`);
  const pushResult = await pushBranch(branch, cwd);
  if (!pushResult.success) {
    onOutput(`✗ ${pushResult.message}`);
    return { success: false, url: '', preview_url: null, duration_seconds: 0, message: pushResult.message };
  }
  onOutput(`✓ ${pushResult.message}`);

  if (deploySection.branch_strategy === 'pr') {
    onOutput('→ Creating PR...');
    const prResult = await createPR(`Update: ${branch}`, `Push from DeckForge`, cwd);
    onOutput(prResult.success ? `✓ ${prResult.message}` : `✗ ${prResult.message}`);
  }

  return { success: true, url: '', preview_url: null, duration_seconds: 0, message: 'Push complete' };
}
