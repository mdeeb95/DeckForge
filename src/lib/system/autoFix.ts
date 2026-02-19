// ─── Auto-Fix Loop — capture crash → Claude fix → restart → repeat ───────────

import { writable, get } from 'svelte/store';
import type { AppError } from './appErrorClassifier';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AutoFixPhase =
  | 'idle'
  | 'fixing'
  | 'restarting'
  | 'watching'
  | 'success'
  | 'exhausted';

// ─── Stores ─────────────────────────────────────────────────────────────────

export const autoFixActive = writable<boolean>(false);
export const autoFixAttempt = writable<number>(0);
export const autoFixPhase = writable<AutoFixPhase>('idle');
export const autoFixErrorHistory = writable<AppError[]>([]);

const MAX_ATTEMPTS = 3;

// ─── Control Functions ──────────────────────────────────────────────────────

/**
 * Start the auto-fix loop with the initial error.
 */
export function startAutoFix(error: AppError): void {
  autoFixActive.set(true);
  autoFixAttempt.set(1);
  autoFixPhase.set('fixing');
  autoFixErrorHistory.set([error]);
}

/**
 * Record a retry after a new crash. Returns true if another attempt is allowed,
 * false if max attempts (3) have been exhausted.
 */
export function recordRetry(newError: AppError): boolean {
  autoFixErrorHistory.update(h => [...h, newError]);
  const attempt = get(autoFixAttempt) + 1;
  autoFixAttempt.set(attempt);

  if (attempt > MAX_ATTEMPTS) {
    autoFixPhase.set('exhausted');
    return false;
  }

  autoFixPhase.set('fixing');
  return true;
}

/**
 * Mark the auto-fix loop as successful — app is stable.
 */
export function markSuccess(): void {
  autoFixPhase.set('success');
  // Don't clear autoFixActive yet — let the UI show the success state briefly
}

/**
 * Abort the auto-fix loop — user interrupted or Claude failed.
 */
export function abortAutoFix(): void {
  autoFixActive.set(false);
  autoFixAttempt.set(0);
  autoFixPhase.set('idle');
  autoFixErrorHistory.set([]);
}

/**
 * Check if auto-fix loop is currently active.
 */
export function isAutoFixActive(): boolean {
  return get(autoFixActive);
}

/**
 * Full cleanup — reset all stores to idle.
 */
export function cleanupAutoFix(): void {
  autoFixActive.set(false);
  autoFixAttempt.set(0);
  autoFixPhase.set('idle');
  autoFixErrorHistory.set([]);
}

// ─── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Build the Claude Code prompt for fixing an app crash.
 * On retries, includes the full error history so Claude can try different approaches.
 */
export function buildAutoFixPrompt(
  error: AppError,
  command: string,
  cwd: string,
  attempt: number,
  history: AppError[],
): string {
  const lines: string[] = [];

  lines.push(`The user's app crashed on startup. Fix the issue so the app runs successfully.`);
  lines.push('');
  lines.push(`**Run command:** \`${command}\``);
  lines.push(`**Working directory:** \`${cwd}\``);
  lines.push(`**Exit code:** ${error.exitCode}`);
  lines.push('');

  // Current error stderr
  lines.push('**Error output (last stderr lines):**');
  lines.push('```');
  for (const line of error.lastStderrLines) {
    lines.push(line);
  }
  lines.push('```');

  // Instructions
  lines.push('');
  lines.push('Fix this error. Common fixes include:');
  lines.push('- Installing missing dependencies (`npm install`, `pip install`, etc.)');
  lines.push('- Fixing broken imports or missing modules');
  lines.push('- Correcting configuration files');
  lines.push('- Creating missing files or directories');

  // Retry context — include history of previous failures
  if (attempt > 1 && history.length > 1) {
    lines.push('');
    lines.push(`**This is attempt ${attempt}/${MAX_ATTEMPTS}.** Previous fixes did not resolve the issue.`);
    lines.push('Here are the errors from previous attempts:');
    lines.push('');
    for (let i = 0; i < history.length - 1; i++) {
      const prev = history[i];
      lines.push(`Attempt ${i + 1} error: ${prev.summary}`);
      if (prev.lastStderrLines.length > 0) {
        lines.push(`  Last stderr: ${prev.lastStderrLines.slice(-3).join(' | ')}`);
      }
    }
    lines.push('');
    lines.push('**Try a DIFFERENT approach than the previous attempts.** The earlier fixes did not work.');
  }

  return lines.join('\n');
}
