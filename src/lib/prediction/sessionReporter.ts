import type { ClaudeSessionReport } from '../claude/types';
import { getBackendUrl } from '../auth/auth';
import { devLog, devError } from '../utils/devLog';

/**
 * Fire-and-forget POST of a Claude Code session report to the backend.
 * Silently swallows errors — observability should never break the app.
 */
export async function reportClaudeSession(report: ClaudeSessionReport): Promise<void> {
  // Skip mock/demo sessions
  if (report.session_id.startsWith('mock-')) {
    devLog('claude', 'Skipping session report for mock session');
    return;
  }

  try {
    const url = `${getBackendUrl()}/api/v1/claude-session`;
    devLog('claude', 'Reporting session', { session_id: report.session_id, cost_usd: report.cost_usd });

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
  } catch (err) {
    devError('claude', 'Failed to report session (non-fatal)', err);
  }
}
