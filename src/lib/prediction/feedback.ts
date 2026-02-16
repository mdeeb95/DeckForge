// ─── Feedback Module ─────────────────────────────────────────────────────────
// Fire-and-forget feedback to the FastAPI backend for RLHF scoring via Langfuse.
// Silently drops if no auth token or no trace_id (mock mode).

import { getAccessToken, getBackendUrl } from '../auth/auth';

export interface FeedbackPayload {
  trace_id: string;
  user_action: 'selected' | 'rerolled' | 'rejected';
  selection_speed_ms?: number;
  selected_index?: number;
  reroll_count?: number;
  plan_approved?: boolean;
  plan_approval_button?: string;
  used_unhinged_modifier?: boolean;
}

/**
 * Send feedback to backend. Fire-and-forget — no await needed.
 * Returns immediately if no auth token or no trace_id.
 */
export function sendFeedback(payload: FeedbackPayload): void {
  const token = getAccessToken();
  if (!token || !payload.trace_id) return;

  const backendUrl = getBackendUrl();

  fetch(`${backendUrl}/api/v1/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  }).catch(e => {
    console.warn('Feedback send failed:', e);
  });
}
