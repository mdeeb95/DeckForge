import type {
  Category,
  ContextPayload,
  PredictionResponse,
  Suggestion,
  Modifier,
  WildCard,
  PlanResponse,
  ScopeLevel,
} from './types';
import { getAccessToken, getBackendUrl, refreshAuth } from '../auth/auth';

// ─── Category → call_type mapping ───────────────────────────────────────────

const CATEGORY_TO_CALL_TYPE: Record<Category, string> = {
  feature: 'level_2_feature',
  bug: 'level_2_bug',
  tech_debt: 'level_2_tech_debt',
  yolo: 'level_2_feature',
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch suggestions from the prediction engine.
 * Tries backend first if authenticated, falls back to mock.
 */
export async function predictSuggestions(
  category: Category,
  context: ContextPayload,
): Promise<PredictionResponse> {
  const token = getAccessToken();
  if (token) {
    try {
      return await remotePredictSuggestions(category, context, token);
    } catch (e) {
      console.warn('Remote prediction failed, falling back to mock:', e);
    }
  }
  return mockPredictSuggestions(category);
}

/**
 * Generate a plan for a selected suggestion.
 * Tries backend first if authenticated, falls back to mock.
 */
export async function generatePlan(
  suggestion: Suggestion,
  context: ContextPayload,
): Promise<PlanResponse> {
  const token = getAccessToken();
  if (token) {
    try {
      return await remoteGeneratePlan(suggestion, context, token);
    } catch (e) {
      console.warn('Remote plan generation failed, falling back to mock:', e);
    }
  }
  return getMockPlan(suggestion);
}

// ─── Remote Backend Calls ────────────────────────────────────────────────────

async function remotePredictSuggestions(
  category: Category,
  context: ContextPayload,
  token: string,
): Promise<PredictionResponse> {
  const backendUrl = getBackendUrl();
  const callType = CATEGORY_TO_CALL_TYPE[category];

  const body = {
    call_type: callType,
    context_payload: context,
  };

  let res = await fetch(`${backendUrl}/api/v1/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  // On 401, try refreshing token and retry once
  if (res.status === 401) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      res = await fetch(`${backendUrl}/api/v1/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshed.access_token}`,
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    throw new Error(`Backend returned ${res.status}`);
  }

  const data = await res.json();
  return mapBackendToPredictionResponse(data);
}

async function remoteGeneratePlan(
  suggestion: Suggestion,
  context: ContextPayload,
  token: string,
): Promise<PlanResponse> {
  const backendUrl = getBackendUrl();

  const body = {
    call_type: 'level_3_plan',
    context_payload: context,
    selected_label: suggestion.label,
    selected_rationale: suggestion.rationale,
    selected_scope: suggestion.scope,
  };

  let res = await fetch(`${backendUrl}/api/v1/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  // On 401, try refreshing token and retry once
  if (res.status === 401) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      res = await fetch(`${backendUrl}/api/v1/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshed.access_token}`,
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    throw new Error(`Backend returned ${res.status}`);
  }

  const data = await res.json();
  return mapBackendToPlanResponse(data);
}

// ─── Response Mappers ────────────────────────────────────────────────────────

function mapBackendToPredictionResponse(data: Record<string, unknown>): PredictionResponse {
  return {
    header_quip: (data.header_quip as string) ?? 'here are some ideas',
    suggestions: (data.suggestions as Suggestion[]) ?? [],
    modifier: (data.modifier as Modifier) ?? { lens: 'general', quip: 'make it better' },
    wild_card: (data.wild_card as WildCard) ?? { label: 'Surprise', quip: 'roll the dice', scope: 'decent chunk' as ScopeLevel, rationale: 'Why not?' },
    trace_id: data.trace_id as string | undefined,
    model_used: data.model_used as string | undefined,
    latency_ms: data.latency_ms as number | undefined,
    cache_hit: data.cache_hit as boolean | undefined,
    cost_usd: data.cost_usd as number | undefined,
  };
}

function mapBackendToPlanResponse(data: Record<string, unknown>): PlanResponse {
  return {
    summary: (data.summary as string) ?? 'Execute the task',
    quip: (data.quip as string) ?? 'let\'s get to work',
    steps: (data.steps as PlanResponse['steps']) ?? [{ n: 1, text: 'Implement the changes' }],
    scope: (data.scope as ScopeLevel) ?? 'decent chunk',
    confidence: (data.confidence as string) ?? 'medium',
    unhinged_modifier: (data.unhinged_modifier as string) ?? 'Go beyond the plan and add some flair.',
    claude_code_intent: (data.claude_code_intent as string) ?? 'Implement the selected task.',
    trace_id: data.trace_id as string | undefined,
    model_used: data.model_used as string | undefined,
    latency_ms: data.latency_ms as number | undefined,
    cost_usd: data.cost_usd as number | undefined,
  };
}

// ─── Mock Suggestions (fallback) ─────────────────────────────────────────────

export async function mockPredictSuggestions(category: Category): Promise<PredictionResponse> {
  await delay(300 + Math.random() * 400);

  switch (category) {
    case 'feature':
      return getFeatureSuggestions();
    case 'bug':
      return getBugSuggestions();
    case 'tech_debt':
      return getTechDebtSuggestions();
    case 'yolo':
      return getYoloSuggestions();
    default:
      return getFeatureSuggestions();
  }
}

function getFeatureSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Add Search and Filter',
      quip: 'your users are ctrl+F-ing in their heads',
      scope: 'decent chunk',
      rationale: 'No search functionality detected. Users with >10 items need filtering.',
    },
    {
      label: 'Add Dark Mode',
      quip: 'save the retinas, save the world',
      scope: 'decent chunk',
      rationale: 'No theme system detected. CSS custom properties can enable this quickly.',
    },
    {
      label: 'Keyboard Shortcuts',
      quip: 'power users will name their firstborn after you',
      scope: 'quick tweak',
      rationale: 'No keyboard event handlers detected outside of form inputs.',
    },
    {
      label: 'Export to Markdown',
      quip: 'because copy-paste is so 2008',
      scope: 'quick tweak',
      rationale: 'Markdown rendering exists but no export. Natural extension.',
    },
    {
      label: 'Drag and Drop Sorting',
      quip: 'let them rearrange the furniture',
      scope: 'decent chunk',
      rationale: 'List items have no ordering mechanism. DnD libraries available.',
    },
    {
      label: 'Real-Time Collaboration',
      quip: 'google docs but you built it on a handheld',
      scope: 'strap in',
      rationale: 'No WebSocket or sync mechanism detected. High impact but complex.',
    },
    {
      label: 'Undo/Redo System',
      quip: 'everyone deserves a second chance',
      scope: 'decent chunk',
      rationale: 'No undo stack detected. State management supports this pattern.',
    },
    {
      label: 'Auto-Save with Indicators',
      quip: 'trust issues? fixed.',
      scope: 'quick tweak',
      rationale: 'No save indicator in UI. Debounced auto-save with visual feedback.',
    },
  ];

  const modifier: Modifier = {
    lens: 'more ambitious',
    quip: 'go big or go home',
  };

  const wild_card: WildCard = {
    label: 'AI-Powered Note Summaries',
    quip: 'your notes, but smarter than you',
    scope: 'strap in',
    rationale: 'Add LLM-powered summarization for long notes. Absurd? Maybe. Cool? Absolutely.',
  };

  return {
    header_quip: 'your app has potential — let\'s unlock it',
    suggestions,
    modifier,
    wild_card,
  };
}

function getBugSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Empty State Crash',
      quip: 'nothing breaks like nothing',
      scope: 'quick tweak',
      rationale: 'No empty state handling in list components.',
      symptom: 'App shows blank white screen when all items are deleted.',
    },
    {
      label: 'Long Text Overflow',
      quip: 'words go brrr right off the screen',
      scope: 'quick tweak',
      rationale: 'No text truncation or overflow handling in card components.',
      symptom: 'Long titles push buttons off screen on mobile.',
    },
    {
      label: 'Double-Submit on Fast Click',
      quip: 'speed demons create duplicates',
      scope: 'quick tweak',
      rationale: 'No debounce on form submission handlers.',
      symptom: 'Clicking save quickly creates duplicate entries.',
    },
    {
      label: 'Stale Data After Tab Switch',
      quip: 'your app has short-term memory loss',
      scope: 'decent chunk',
      rationale: 'No visibility change listener or data refresh on focus.',
      symptom: 'Switching tabs and coming back shows outdated information.',
    },
    {
      label: 'Broken Back Button',
      quip: 'there\'s no going back... literally',
      scope: 'decent chunk',
      rationale: 'History API not integrated with navigation state.',
      symptom: 'Browser back button doesn\'t navigate to the previous view.',
    },
    {
      label: 'Memory Leak in Listeners',
      quip: 'your RAM called, it\'s filing for divorce',
      scope: 'decent chunk',
      rationale: 'Event listeners in useEffect without cleanup functions.',
      symptom: 'App gets progressively slower the longer it\'s open.',
    },
    {
      label: 'XSS in User Input',
      quip: 'script tags lurking like ninjas',
      scope: 'quick tweak',
      rationale: 'Markdown rendering may not sanitize HTML input.',
      symptom: 'Pasting HTML in notes could execute arbitrary scripts.',
    },
    {
      label: 'Race Condition on Save',
      quip: 'fastest save wins, others cry',
      scope: 'decent chunk',
      rationale: 'Multiple concurrent save operations may overwrite each other.',
      symptom: 'Editing quickly sometimes loses the most recent changes.',
    },
  ];

  const modifier: Modifier = {
    lens: 'security focused',
    quip: 'what would a hacker do?',
  };

  const wild_card: WildCard = {
    label: 'Timezone Apocalypse',
    quip: 'somewhere a date is wrong and nobody knows',
    scope: 'decent chunk',
    rationale: 'Date handling likely assumes local timezone. Test with UTC edge cases.',
    symptom: 'Timestamps show wrong dates for users in different timezones.',
  };

  return {
    header_quip: 'let\'s hunt some bugs before they find your users',
    suggestions,
    modifier,
    wild_card,
  };
}

function getTechDebtSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Add Unit Tests',
      quip: 'future-you will send a thank you card',
      scope: 'decent chunk',
      rationale: '0 test files detected. Basic coverage for core logic recommended.',
      evidence: 'No test/ or __tests__/ directory found.',
    },
    {
      label: 'Extract Shared Components',
      quip: 'DRY your code, DRY your tears',
      scope: 'decent chunk',
      rationale: 'Multiple files have similar UI patterns that could be shared.',
      evidence: 'Button and Card patterns repeated across 4 files.',
    },
    {
      label: 'Add Error Boundaries',
      quip: 'catch errors before they catch users',
      scope: 'quick tweak',
      rationale: 'No error boundary components detected.',
      evidence: 'React error boundaries missing. One uncaught error crashes the whole app.',
    },
    {
      label: 'Type-Safe API Layer',
      quip: 'any is not a type, it\'s a cry for help',
      scope: 'decent chunk',
      rationale: 'API calls use raw fetch without type validation.',
      evidence: 'Multiple fetch() calls with no response type checking.',
    },
    {
      label: 'Split Large Files',
      quip: 'App.tsx is not a novel',
      scope: 'decent chunk',
      rationale: 'Main file exceeds 300 lines. Single-responsibility principle.',
      evidence: 'src/App.tsx has 387 lines with mixed concerns.',
    },
    {
      label: 'Add Loading States',
      quip: 'spinners > staring at nothing',
      scope: 'quick tweak',
      rationale: 'Async operations have no loading indicators.',
      evidence: 'No loading/spinner component or state found.',
    },
    {
      label: 'Setup CI Pipeline',
      quip: 'automate the boring stuff',
      scope: 'quick tweak',
      rationale: 'No .github/workflows or CI config detected.',
      evidence: 'No CI/CD configuration files in repository.',
    },
    {
      label: 'Accessibility Audit',
      quip: 'your app should work for everyone',
      scope: 'decent chunk',
      rationale: 'No ARIA labels or accessibility testing detected.',
      evidence: 'Interactive elements lack aria-label attributes.',
    },
  ];

  const modifier: Modifier = {
    lens: 'make it testable',
    quip: 'tests are love letters to your future self',
  };

  const wild_card: WildCard = {
    label: 'Rewrite in Rust',
    quip: 'btw i use blazingly fast memory safety',
    scope: 'strap in',
    rationale: 'Obviously ridiculous but technically the hot path COULD be a WASM module.',
  };

  return {
    header_quip: 'time to pay down the technical credit card',
    suggestions,
    modifier,
    wild_card,
  };
}

function getYoloSuggestions(): PredictionResponse {
  const suggestions: Suggestion[] = [
    {
      label: 'Add Sound Effects',
      quip: 'every click deserves a boop',
      scope: 'quick tweak',
      rationale: 'Web Audio API is trivial. Maximum fun per line of code.',
    },
    {
      label: 'Confetti on Save',
      quip: 'celebrate the small wins, literally',
      scope: 'quick tweak',
      rationale: 'Canvas confetti library is 3kb. Joy-to-effort ratio is off the charts.',
    },
    {
      label: 'Easter Egg Konami Code',
      quip: 'up up down down left right left right',
      scope: 'quick tweak',
      rationale: 'Hidden feature that rewards curiosity. 20 lines of code.',
    },
    {
      label: 'ASCII Art Loading Screen',
      quip: 'make the wait aesthetically pleasing',
      scope: 'quick tweak',
      rationale: 'Replace spinner with animated ASCII art. Terminal vibes.',
    },
    {
      label: 'Add a Pet Companion',
      quip: 'clippy but actually good this time',
      scope: 'decent chunk',
      rationale: 'Animated CSS sprite that reacts to user actions. Delightful.',
    },
    {
      label: 'Matrix Rain Background',
      quip: 'neo would be proud of your notes app',
      scope: 'decent chunk',
      rationale: 'Canvas-based falling character animation. Toggle-able via settings.',
    },
    {
      label: 'Achievement System',
      quip: 'gamify the mundane, profit from dopamine',
      scope: 'decent chunk',
      rationale: 'Track user milestones and show toast notifications. Engagement hack.',
    },
    {
      label: 'Voice Commands',
      quip: 'hey notes app, take a memo',
      scope: 'strap in',
      rationale: 'Web Speech API exists. Why not? Why not indeed.',
    },
  ];

  const modifier: Modifier = {
    lens: 'maximum chaos',
    quip: 'hold my beer and watch this',
  };

  const wild_card: WildCard = {
    label: 'AI Roast My Code',
    quip: 'let the machine judge your life choices',
    scope: 'decent chunk',
    rationale: 'Feed code to an LLM and display sarcastic code reviews. Brutal but educational.',
  };

  return {
    header_quip: 'feeling dangerous? let\'s get weird',
    suggestions,
    modifier,
    wild_card,
  };
}

// ─── Mock Plan Generation ────────────────────────────────────────────────────

export function getMockPlan(suggestion: Suggestion): PlanResponse {
  const planMap: Record<string, PlanResponse> = {
    'Add Search and Filter': {
      summary: 'Add fuzzy search and active-status filtering to the notes list',
      quip: 'making needle-in-haystack a solved problem',
      steps: [
        { n: 1, text: 'Create a SearchInput component with debounced onChange handler' },
        { n: 2, text: 'Add useMemo hook for filtered results based on search query' },
        { n: 3, text: 'Wire up an activeOnly toggle with boolean state' },
        { n: 4, text: 'Update the list render to use filteredUsers instead of raw array' },
        { n: 5, text: 'Add unit tests for search and filter logic' },
      ],
      scope: 'decent chunk',
      confidence: 'high',
      unhinged_modifier: 'Add AI-powered semantic search that understands typos and vibes. Also add a "feeling lucky" button that opens a random note.',
      claude_code_intent: 'Add search and filtering functionality to the notes list. Users should be able to type a query to fuzzy-match note titles and content, and toggle a filter to show only active/recent notes. Include debounced input for performance and appropriate empty states.',
    },
  };

  if (planMap[suggestion.label]) {
    return planMap[suggestion.label];
  }

  return {
    summary: suggestion.label,
    quip: suggestion.quip,
    steps: [
      { n: 1, text: `Analyze the codebase to identify where ${suggestion.label.toLowerCase()} should be implemented` },
      { n: 2, text: 'Create any new components or modules needed' },
      { n: 3, text: 'Implement the core logic and wire it into existing code' },
      { n: 4, text: 'Add appropriate error handling and edge cases' },
      { n: 5, text: 'Test the implementation and verify it works correctly' },
    ],
    scope: suggestion.scope,
    confidence: 'medium',
    unhinged_modifier: `Go beyond the strict plan. Add extra flair, unexpected polish, and anything else that makes ${suggestion.label.toLowerCase()} feel magical.`,
    claude_code_intent: `Implement ${suggestion.label}: ${suggestion.rationale}. The implementation should be clean, well-tested, and follow existing project conventions.`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
