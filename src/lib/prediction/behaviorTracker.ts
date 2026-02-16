// ─── Behavior Tracker ────────────────────────────────────────────────────────
// Tracks user behavior in .deckforge/behavior.json for personalization.
// All operations are async non-blocking — callers should not await.

import { get } from 'svelte/store';
import type { Category, Suggestion, WildCard } from './types';
import { projectConfig, updateProjectBehavior } from '../stores/configStores';

/**
 * Track when a suggestion is selected on Level 2.
 */
export async function trackSuggestionSelected(
  category: Category,
  suggestion: Suggestion | WildCard,
  button: string,
  timeToSelectMs: number,
  rerollCount: number,
  optionsShown: string[],
  wildCardShown: string | undefined,
): Promise<void> {
  const config = get(projectConfig);
  if (!config) return;

  try {
    await updateProjectBehavior(config.project.path, (behavior) => {
      const now = new Date().toISOString();
      const agg = { ...behavior.aggregate };

      // Increment category count
      agg.categories_selected = { ...agg.categories_selected };
      agg.categories_selected[category] = (agg.categories_selected[category] ?? 0) + 1;

      // Track option slot preference (A, B, X for wildcard)
      agg.option_slot_preferences = { ...agg.option_slot_preferences };
      agg.option_slot_preferences[button] = (agg.option_slot_preferences[button] ?? 0) + 1;

      // Update rolling average time to select
      const totalSelections = Object.values(agg.categories_selected).reduce((a, b) => a + b, 0);
      if (totalSelections > 1) {
        agg.avg_time_to_select_ms = Math.round(
          (agg.avg_time_to_select_ms * (totalSelections - 1) + timeToSelectMs) / totalSelections
        );
      } else {
        agg.avg_time_to_select_ms = timeToSelectMs;
      }

      agg.last_category = category;

      // Append session event
      const sessionEvents = [...behavior.session_events, {
        timestamp: now,
        screen: 'level2',
        selected: suggestion.label,
        time_to_select_ms: timeToSelectMs,
        options_shown: optionsShown,
        wild_card_shown: wildCardShown,
        reroll_count: rerollCount,
      }];

      return { ...behavior, aggregate: agg, session_events: sessionEvents, last_updated: now };
    });
  } catch (e) {
    console.warn('Behavior tracking (suggestion selected) failed:', e);
  }
}

/**
 * Track when a plan is approved (Ship It or Ship It Unhinged).
 */
export async function trackPlanApproved(
  category: Category,
  suggestion: Suggestion | WildCard,
  button: string,
): Promise<void> {
  const config = get(projectConfig);
  if (!config) return;

  try {
    await updateProjectBehavior(config.project.path, (behavior) => {
      const now = new Date().toISOString();

      const approvalHistory = [...behavior.approval_history, {
        label: suggestion.label,
        category,
        approved_at: now,
        plan_button: button,
        task_completed: false,
        rolled_back: false,
      }];

      const sessionEvents = [...behavior.session_events, {
        timestamp: now,
        screen: 'level3',
        selected: suggestion.label,
        time_to_select_ms: 0,
        unhinged: button === 'ship_it_unhinged',
      }];

      return { ...behavior, approval_history: approvalHistory, session_events: sessionEvents, last_updated: now };
    });
  } catch (e) {
    console.warn('Behavior tracking (plan approved) failed:', e);
  }
}

/**
 * Track when a plan is rejected (Go Back from Level 3).
 */
export async function trackPlanRejected(
  category: Category,
  suggestion: Suggestion | WildCard,
): Promise<void> {
  const config = get(projectConfig);
  if (!config) return;

  try {
    await updateProjectBehavior(config.project.path, (behavior) => {
      const now = new Date().toISOString();
      const agg = { ...behavior.aggregate };

      // Update rejection history
      const rejectionHistory = [...behavior.rejection_history];
      const existing = rejectionHistory.find(r => r.label === suggestion.label && r.category === category);
      if (existing) {
        existing.rejected_count += 1;
        existing.rejected_at = now;
      } else {
        rejectionHistory.push({
          label: suggestion.label,
          category,
          rejected_at: now,
          rejected_count: 1,
          suppressed_until_session: 0,
        });
      }

      // Update plans_rejected_pct
      const totalApprovals = behavior.approval_history.length;
      const totalRejections = rejectionHistory.reduce((sum, r) => sum + r.rejected_count, 0);
      const totalDecisions = totalApprovals + totalRejections;
      agg.plans_rejected_pct = totalDecisions > 0 ? Math.round((totalRejections / totalDecisions) * 100) : 0;

      const sessionEvents = [...behavior.session_events, {
        timestamp: now,
        screen: 'level3',
        selected: `rejected:${suggestion.label}`,
        time_to_select_ms: 0,
      }];

      return {
        ...behavior,
        aggregate: agg,
        rejection_history: rejectionHistory,
        session_events: sessionEvents,
        last_updated: now,
      };
    });
  } catch (e) {
    console.warn('Behavior tracking (plan rejected) failed:', e);
  }
}
