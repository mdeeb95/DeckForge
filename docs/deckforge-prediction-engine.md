# DeckForge — Prediction Engine: Prompt Architecture & Design

**The prediction engine is the brain of the right panel.** It's the system that makes ABXY feel like mind-reading instead of multiple choice. This document specifies every prompt, every context payload, every response contract, and the feedback loop that makes predictions improve over time.

**This is NOT Claude Code.** The prediction engine uses direct LLM API calls (Anthropic, OpenAI, or Gemini — user-configurable). It's fast, cheap, stateless per-call, and optimized for creative/analytical suggestions rather than code generation.

---

## 1. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────┐
│                    DeckForge App                         │
│                                                         │
│  ┌──────────────┐          ┌──────────────────────────┐ │
│  │  Left Panel   │          │      Right Panel          │ │
│  │  Claude Code  │          │   Action Palette / UI     │ │
│  │  (SDK subprocess)        │                          │ │
│  │              │          │  ┌────────────────────┐   │ │
│  │  Writes code │          │  │ Prediction Engine  │   │ │
│  │  Runs tests  │          │  │                    │   │ │
│  │  Edits files │          │  │ Direct LLM API     │   │ │
│  │              │          │  │ (Haiku/Flash/Mini)  │   │ │
│  │              │          │  └────────┬───────────┘   │ │
│  └──────────────┘          │           │               │ │
│                            │     Generates:            │ │
│                            │     - L2 suggestions      │ │
│                            │     - Plan summaries      │ │
│                            │     - Bug detections      │ │
│                            │     - Exploration ideas   │ │
│                            │     - QA analysis         │ │
│                            │     - Personality quips   │ │
│                            └──────────────────────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Context Assembler                       │ │
│  │  Gathers project metadata for prediction calls       │ │
│  │  file tree · git log · errors · user history         │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Key Principle: The Context Assembler

Every prediction call needs project context, but NOT the full codebase. The **Context Assembler** is a local module (no LLM needed) that builds a structured snapshot of the project state. This snapshot is included in every prediction prompt. It's cheap to build (just filesystem reads + git commands) and keeps the LLM calls fast.

---

## 2. CONTEXT ASSEMBLER: What the Prediction Engine Knows

The Context Assembler runs locally before every prediction call. It produces a structured JSON payload.

### 2.1 Context Payload Schema

```json
{
  "project": {
    "name": "my-notes-app",
    "type_detected": "node-web",
    "created_at": "2025-02-14T18:30:00Z",
    "session_number": 4,
    "total_ai_tasks_completed": 12
  },
  "file_tree": {
    "summary": "23 files, 6 directories",
    "top_level": ["package.json", "src/", "public/", "tests/", "README.md"],
    "largest_files": [
      {"path": "src/App.js", "lines": 387},
      {"path": "src/components/NoteList.js", "lines": 142}
    ],
    "recently_modified": [
      {"path": "src/components/NoteEditor.js", "modified": "2 tasks ago"},
      {"path": "src/App.js", "modified": "1 task ago"}
    ]
  },
  "git_history": {
    "recent_commits": [
      {"message": "Add note editing with markdown support", "files_changed": 3},
      {"message": "Add note creation and listing", "files_changed": 5},
      {"message": "Initial project setup with React", "files_changed": 8}
    ],
    "uncommitted_changes": false
  },
  "detected_features": [
    "note creation",
    "note listing",
    "note editing",
    "markdown rendering"
  ],
  "detected_gaps": [
    "no search/filter functionality",
    "no tests (0 test files)",
    "no dark mode / theme support",
    "no data persistence (localStorage only)",
    "no error boundaries"
  ],
  "current_errors": [],
  "tech_stack": {
    "framework": "React 18",
    "build_tool": "Vite",
    "language": "JavaScript",
    "dependencies": ["react-markdown", "zustand"]
  },
  "user_behavior": {
    "categories_selected": {"Feature": 8, "Bug": 3, "Tech Debt": 1, "Yolo": 0},
    "rerolls_per_session_avg": 1.2,
    "plans_rejected_pct": 15,
    "last_category": "Feature",
    "preferred_complexity": "medium",
    "voice_usage_count": 0
  }
}
```

### 2.2 How Each Field Is Built

| Field | Source | Cost |
|-------|--------|------|
| `project.*` | Local config file (`.deckforge/project.json`) | Free |
| `file_tree.*` | `find` + `wc -l` on project directory | ~50ms |
| `git_history.*` | `git log --oneline -10` + `git status` | ~30ms |
| `detected_features` | **DeckForge's own auto-commit messages** (see 2.2.1 below) | ~10ms |
| `detected_gaps` | Rule-based heuristics with app-type-aware rulesets (see 2.2.2 below) | ~20ms |
| `current_errors` | Last build output / linter output, cached | ~0ms (cached) |
| `tech_stack.*` | Parsed from package.json / requirements.txt / Cargo.toml etc. | ~10ms |
| `user_behavior.*` | Local analytics store (`.deckforge/behavior.json`) | Free |

**Total context assembly time: ~120ms.** This is fast enough to run synchronously before every prediction call.

#### 2.2.1 Feature Detection: Use DeckForge's Own Commits

User-written git commit messages are useless for feature detection ("wip", "stuff", "aaaaaaa"). But DeckForge auto-commits after every completed task (Requirements 0.1), and the commit message IS the plan summary from Section 3.4 — e.g., "Add search and filtering to notes app." These are structured, descriptive, and machine-readable.

**Feature detection algorithm:**
1. Read all commits with `[DeckForge]` prefix tag (DeckForge-generated commits are tagged to distinguish from user commits)
2. Extract the plan summary text from each
3. Build a deduplicated feature list from the summaries
4. Fallback for pre-DeckForge commits: basic keyword extraction from commit messages (unreliable, but better than nothing)

This means `detected_features` gets MORE accurate the longer DeckForge is used on a project. First session = sparse. Fifth session = detailed map of everything built.

#### 2.2.2 Gap Detection: App-Type-Aware Rulesets

Gap detection can't be one-size-fits-all — "no test files" means something for a React app but nothing for a Godot game. Rulesets are selected based on `tech_stack.framework` / project type:

| Project Type | Gaps to Check |
|-------------|---------------|
| **Node/React/Vue** | No tests, no error boundaries, no routing, no state management, massive files (>300 lines), no .env handling, no accessibility |
| **Python CLI** | No argparse/click, no tests, no README, no type hints, no error handling |
| **Godot/Game** | No scene organization, no input mapping, missing export presets, no save/load |
| **Generic** | No README, no .gitignore, largest file >500 lines, no license |

### 2.3 Cold-Start Strategy

A brand new project (session 1) has zero behavioral data, zero DeckForge commits, and sparse feature detection. Predictions will be generic. Since first impressions determine whether a user comes back, cold-start needs explicit handling:

1. **Inherit global behavior** from the user's other projects (if any). Category preferences, complexity preferences, and reroll patterns carry over.
2. **Project-type inference:** Run the Context Assembler on the initial file tree and infer likely next steps based on project type alone. A new React app with only `App.js` probably needs: routing, components, state management, styling. A new Python project with one file probably needs: argument parsing, a second module, tests.
3. **Template-based suggestions:** For very new projects (<3 files), skip the LLM for Level 2 Feature suggestions and use curated starter suggestion sets per project type. Once 3+ DeckForge commits exist, switch to full LLM generation.
4. **Aggressive prefetching:** On cold-start, prefetch ALL categories at Level 1 AND pre-generate 2 plan variants for the most likely first feature. The user's first experience should feel instant.

### 2.4 Context Size Budget

The context payload should stay **under 2,000 tokens** when serialized into the prompt. Combined with prompt template (~400 tokens) and expected response (~500 tokens), total per-call is ~2,900 tokens. This keeps prediction calls cheap and fast.

**Enforcement: actual token counting, not just item limits.** The Context Assembler runs a lightweight tokenizer (tiktoken or equivalent) on the serialized payload. If it exceeds 2,000 tokens, it truncates fields in priority order (lowest priority trimmed first):

1. `current_errors` — truncate stack traces to first 2 lines each (lowest priority)
2. `git_history.recent_commits` — reduce from 10 to 5
3. `file_tree.top_level` — reduce from 20 to 10, deeper files become counts
4. `detected_gaps` — reduce from 8 to 4
5. `detected_features` — reduce from 15 to 8 (highest priority, trimmed last)

Item count caps are the first line of defense, token counting is the enforcement backstop.

---

## 3. PROMPT TEMPLATES: Every Screen That Calls the Prediction Engine

Each screen has a specific prompt template. The prediction engine receives the template + the context payload and returns a structured JSON response. **Every prompt enforces the Y-is-chaotic rule.**

### 3.1 Level 2: Feature Suggestions

**When triggered:** User presses A (Feature) at Level 1.

**Prompt:**
```
You are the suggestion engine for DeckForge, a gamepad-only coding interface.
The user just selected "Feature" — they want to build something new.

PROJECT CONTEXT:
{context_payload}

PREVIOUSLY REJECTED FEATURES (do not suggest these):
{rejected_features_list}

Generate exactly 8 feature suggestions for this project, ranked by relevance.
The top 2 will be shown immediately on the A and B buttons. The remaining 6
will be accessible via D-pad scrolling and reroll. Generate variety — don't
cluster around one theme.

Additionally generate:
- modifier: A "reroll modifier" lens (shown on X button). Examples: "something visual", "something that makes it faster", "something weird", "something social". Rotate these across calls.
- wild_card: Something RIDICULOUS (shown on Y button). Absurd on the surface but secretly compelling if you think about it for 2 seconds. It must be contextually relevant to the project (not random nonsense) and technically buildable. The joke is funnier when the AI can actually make it. Examples for a notes app: "add a mood ring to each note that analyzes sentiment", "notes that auto-destruct after reading like a spy movie", "a notes-to-haiku converter that actually scans well."

Each of the 8 suggestions needs:
- label: Short name (2-5 words)
- quip: A one-liner personality tagline (sassy, funny, roasts the situation not the person). Max 60 chars. These set the entire tone of the app — make them actually funny, not just clever-adjacent.
- scope: "quick tweak" | "decent chunk" | "strap in" (qualitative, not minutes)
- rationale: One sentence explaining WHY this suggestion (hidden from user, used for plan generation if selected)

Respond in JSON only. No markdown, no explanation.
```

**Expected response:**
```json
{
  "header_quip": "pick a feature, any feature",
  "suggestions": [
    {
      "label": "Add search & filter",
      "quip": "find your own notes for once",
      "scope": "decent chunk",
      "rationale": "Project has 0 search functionality and growing note count makes this critical"
    },
    {
      "label": "Add tags & categories",
      "quip": "marie kondo would be proud. maybe.",
      "scope": "decent chunk",
      "rationale": "Notes are flat list with no organization system"
    },
    {
      "label": "Add keyboard shortcuts",
      "quip": "ctrl+s won't save this project but it's a start",
      "scope": "quick tweak",
      "rationale": "No keyboard navigation exists, common UX expectation"
    },
    {
      "label": "Export to markdown",
      "quip": "let your notes escape their prison",
      "scope": "quick tweak",
      "rationale": "Notes are trapped in the app with no export"
    },
    {
      "label": "Add note pinning",
      "quip": "play favorites with your own thoughts",
      "scope": "quick tweak",
      "rationale": "No way to prioritize important notes"
    },
    {
      "label": "Dark mode",
      "quip": "join the dark side, we have better contrast",
      "scope": "decent chunk",
      "rationale": "No theme system exists"
    },
    {
      "label": "Collaborative editing",
      "quip": "share the chaos",
      "scope": "strap in",
      "rationale": "Currently single-user only"
    },
    {
      "label": "Undo/redo history",
      "quip": "because ctrl+z is a human right",
      "scope": "decent chunk",
      "rationale": "No edit history, destructive edits only"
    }
  ],
  "modifier": {
    "lens": "something visual",
    "quip": "make it pretty this time"
  },
  "wild_card": {
    "label": "Add a mood ring to each note",
    "quip": "sentient stationery that judges your tone",
    "scope": "quick tweak",
    "rationale": "Analyze note sentiment with keyword matching and display as a color strip — absurd but surprisingly delightful"
  }
}
```

**Display logic:** `suggestions[0]` and `suggestions[1]` map to A and B buttons. `modifier` maps to X. `wild_card` maps to Y. On reroll (RB), advance to `suggestions[2]` and `suggestions[3]`, then `[4]` and `[5]`, then `[6]` and `[7]`. After exhausting all 8, THEN make a fresh API call. This gives 3 free rerolls before hitting the network.

### 3.2 Level 2: Bug Detection

**When triggered:** User presses B (Bug) at Level 1.

**Prompt:**
```
You are the bug detection engine for DeckForge, a gamepad-only coding interface.
The user just selected "Bug" — they think something is broken.

PROJECT CONTEXT:
{context_payload}

CURRENT ERRORS (if any):
{current_errors}

RECENT BUILD OUTPUT:
{last_build_output_truncated}

Generate exactly 8 potential bugs/issues, ranked by likelihood. Describe each
as the USER-VISIBLE SYMPTOM — what the user would actually see go wrong —
not technical analysis. Think: "notes disappear when you reload the page"
not "no persistence layer detected." Technical details belong in the plan,
not the suggestion label.

The top 2 will be shown on A and B buttons. Remaining 6 accessible via D-pad/reroll.

Additionally:
- voice_escape: Always present as X button. The user describes the bug verbally (high-friction voice input via LB+A combo). Generate a contextual quip for this slot.
- wild_card: Y button. A RIDICULOUS hypothetical bug — absurd but actually testable. "What happens if you paste the entire bee movie script?" "What if you make 10,000 notes and scroll really fast?" Secretly, these are stress-test ideas wearing a funny hat.

Each of the 8 bug suggestions needs:
- label: Short name describing the symptom (2-6 words)
- quip: A sassy one-liner. Max 60 chars. Empathize with the frustration, don't be clinical.
- symptom: One sentence describing what the user would actually see/experience
- rationale: Technical evidence from context (hidden from user, used for plan generation)

Respond in JSON only.
```

**Expected response:**
```json
{
  "header_quip": "what's broken this time?",
  "suggestions": [
    {
      "label": "Notes vanish on reload",
      "quip": "your notes have commitment issues",
      "symptom": "If you close the app and reopen it, all your notes are gone",
      "rationale": "No persistence layer detected — state is in-memory only, localStorage not used"
    },
    {
      "label": "One bad click crashes everything",
      "quip": "the app is one fetch() away from giving up",
      "symptom": "If the network drops or an API call fails, the whole app goes white",
      "rationale": "0 try/catch blocks, 0 error boundaries in React components"
    },
    {
      "label": "Can't find old notes",
      "quip": "scrolling forever is not a search strategy",
      "symptom": "As you add more notes there's no way to find specific ones without scrolling through everything",
      "rationale": "No search/filter, flat list rendering"
    },
    {
      "label": "Markdown renders wrong",
      "quip": "bold move assuming it works",
      "symptom": "Some markdown syntax like nested lists or code blocks doesn't render correctly in the editor preview",
      "rationale": "react-markdown with default config, likely missing plugins for GFM"
    },
    {
      "label": "Huge notes lag the editor",
      "quip": "your novel is choking the app",
      "symptom": "Typing in a very long note gets noticeably slow and laggy",
      "rationale": "No debouncing on input, re-rendering entire component on every keystroke"
    },
    {
      "label": "No confirmation on delete",
      "quip": "one misclick and it's gone forever",
      "symptom": "Pressing delete immediately removes the note with no undo or confirmation",
      "rationale": "Delete handler has no confirmation dialog, no soft-delete"
    },
    {
      "label": "Browser back breaks the app",
      "quip": "the back button is a betrayal",
      "symptom": "Pressing browser back from the editor leaves you on a blank page",
      "rationale": "No client-side routing, no history management"
    },
    {
      "label": "New note isn't focused",
      "quip": "you clicked 'new' and then... nothing happened?",
      "symptom": "Creating a new note doesn't automatically open it for editing — you have to find and click it",
      "rationale": "Create handler adds to state but doesn't update selected note"
    }
  ],
  "voice_escape": {
    "label": "I'll describe it",
    "quip": "fine, use your words (LB+A)",
    "is_voice_input": true
  },
  "wild_card": {
    "label": "What if 10,000 notes?",
    "quip": "stress test your digital hoarding",
    "symptom": "What happens to performance when the note list gets absurdly large?",
    "rationale": "NoteList renders all items with no virtualization — guaranteed to choke"
  }
}
```

**Display logic:** Same as Feature — `suggestions[0]` and `[1]` on A/B, cycle through pairs on reroll, `voice_escape` on X, `wild_card` on Y.

### 3.3 Level 2: Tech Debt / Cleanup

**When triggered:** User presses X (Tech Debt) at Level 1.

**Prompt:**
```
You are the code quality analyzer for DeckForge, a gamepad-only coding interface.
The user just selected "Tech Debt" — they want to clean up their project.

PROJECT CONTEXT:
{context_payload}

Generate exactly 8 cleanup/improvement suggestions, ranked by impact. Mix
different types: refactoring, testing, documentation, performance, accessibility,
dependency hygiene. The top 2 map to A/B buttons, rest accessible via D-pad/reroll.

Additionally:
- modifier: X button. A "cleanup lens" — cycles through: "make it testable", "make it readable", "make it faster", "make it accessible". Regenerates with this focus.
- wild_card: Y button. A RIDICULOUS cleanup task. "Delete all comments and replace with haiku", "rename every variable to a fruit", "add a philosophical quote above every function." Absurd but surprisingly compelling.

Each of the 8 suggestions needs:
- label: Short name (2-5 words)
- quip: A sassy one-liner. Max 60 chars.
- scope: "quick tweak" | "decent chunk" | "strap in"
- evidence: Specific files/metrics that justify this suggestion (hidden from user)

Respond in JSON only.
```

**Response format:** Same structure as Feature suggestions — `suggestions[]` array of 8, `modifier`, `wild_card`.

### 3.4 Level 3: Plan Generation

**When triggered:** User selects A or B at Level 2 (picks a specific suggestion).

**This is the bridge between the prediction engine and Claude Code.** The prediction engine generates a human-readable plan summary. If the user approves, the plan text is sent to Claude Code as the actual coding prompt.

**Prompt:**
```
You are the plan generator for DeckForge, a gamepad-only coding interface.

The user selected this action:
- Category: {category} (Feature / Bug / Tech Debt)
- Selection: {selected_option.label}
- Rationale: {selected_option.rationale}
- Complexity: {selected_option.complexity}

PROJECT CONTEXT:
{context_payload}

Generate an implementation plan that will be shown to the user for approval. The plan must be:
1. Broken into numbered steps (3-8 steps)
2. Each step is one sentence, plain English, no jargon
3. Include an estimated time (in AI-minutes, not human-minutes: "~2 min", "~5 min", "~10 min")
4. Include a confidence level for the whole plan

Also generate:
- summary: A one-line plain English summary of what will happen ("I'll add search to your notes app with fuzzy matching")
- quip: A personality one-liner for the plan header
- unhinged_modifier: What changes if the user picks Y ("Ship it but unhinged") — this should ADD flair, not change the core plan. Examples: "I'll also add confetti when search finds a result", "every refactored function gets a dramatic comment"
- claude_code_intent: A clear description of WHAT to build and WHY, written at the intent level. Do NOT reference specific file names or implementation details — Claude Code will figure those out by reading the codebase itself. Focus on the desired outcome, constraints, and acceptance criteria.

Respond in JSON only.
```

**Expected response:**
```json
{
  "summary": "I'll add search and filtering to your notes app",
  "quip": "finally, some organization in this chaos",
  "steps": [
    {"n": 1, "text": "Add a search bar component above the note list"},
    {"n": 2, "text": "Implement fuzzy text matching on note titles and content"},
    {"n": 3, "text": "Add real-time filtering as the user types"},
    {"n": 4, "text": "Style the search bar to match existing design"},
    {"n": 5, "text": "Handle empty results with a helpful message"}
  ],
  "scope": "decent chunk",
  "confidence": "high",
  "unhinged_modifier": "Search results will bounce in with a little animation and the empty state will show a tiny detective emoji looking for notes",
  "claude_code_intent": "Add search and filter functionality to the notes app. Users should be able to type in a search bar above the note list and see results filter in real-time. Match against both note titles and body content. Use simple text matching — no external search library needed. Style consistently with the existing UI. Show a friendly empty-results message when nothing matches."
}
```

**The `claude_code_intent` field is critical.** This is the actual string that gets sent to Claude Code if the user approves. It's written at the INTENT level — what to build and why, not how to build it. Claude Code is better at implementation details than the prediction engine (it reads the actual codebase), so we let it figure out file names, component structure, and specific patterns. The prediction engine describes the destination; Claude Code finds the route.

### 3.5 Exploration Mode: Project Ideas

**When triggered:** User enters Exploration Mode from project select (X button).

**Prompt:**
```
You are the project idea generator for DeckForge, a gamepad-only coding app on Steam Deck.
The user doesn't know what to build. Suggest fun, buildable project ideas.

CATEGORY: {category}
(One of: Games, Tools, Art+Creative, Just For Fun, Surprise Me)

USER HISTORY (if any):
- Past projects: {past_project_names_and_types}
- Preferred complexity: {user_behavior.preferred_complexity}

Generate exactly 4 project ideas for this category:

- option_a: A crowd-pleaser. Something most developers would think is fun to build.
- option_b: A niche/interesting idea. Something unexpected but compelling.
- option_x: "More ideas" — show 4 more in this category (pagination signal, not a real idea).
- option_y: Something RIDICULOUS. A project idea so absurd it loops back around to being genuinely fun to build. "A desktop pet that judges your code", "A weather app but for your emotions", "Snake but the snake is a linked list visualization".

Each idea needs:
- label: Project name (2-4 words)
- hook: One sentence that sells the FEELING of building this, not the feature list. Make it irresistible. "What if you could draw sprites without leaving the Deck? Tiny pixels, big energy." NOT "Build a browser-based pixel art tool with layers and export."
- quip: A sassy one-liner pitch. Max 80 chars.
- description: 1-2 sentences explaining what you'd actually build (the practical details).
- tech_suggestion: What tech stack would work well ("React + Canvas", "Python CLI", "Godot", etc.)
- scope: "one session" | "a few sessions" | "a whole weekend"

Don't suggest projects the user has already built (check past_projects).

Respond in JSON only.
```

### 3.6 QA Mode: Test Analysis

**When triggered:** User enters QA mode (Menu button).

**Prompt:**
```
You are the QA analyzer for DeckForge, a gamepad-only coding interface.
The user wants to test their app. Analyze the project and suggest what to test.

PROJECT CONTEXT:
{context_payload}

SCREENSHOTS (if available):
{recent_screenshots_as_base64}

Generate a QA test plan:

- features_to_test: List of 3-6 testable features based on detected_features and recent changes
- For each feature:
  - name: Feature name
  - test_description: What to check (1 sentence)
  - how_to_test: Specific actions ("click the save button, reload the page, check if notes persist")
  - risk_level: "high" | "medium" | "low" based on how recently it was modified and how complex it is
  - quip: A one-liner about this test

Also generate:
- overall_quip: A header message for the QA screen
- quick_test_suggestion: The single most important thing to test right now (for users who just want a quick sanity check)

Respond in JSON only.
```

### 3.7 Reroll Mechanics

There are two reroll mechanisms:

**RB (Reroll All):** Cycles through the cached 8-option list. No API call needed for the first 3 rerolls. After all 8 options are exhausted, a fresh API call generates 8 more. The fresh call includes all previously shown suggestions as "do NOT repeat" context.

**X (Reroll with Modifier):** Immediately generates a fresh 8-option set through a MODIFIED prompt. This always hits the API because the modifier changes the generation lens. The modifier cycles through: "more ambitious" → "simpler" → "weirder" → "more useful" → "more visual" → (back to start). Each press of X advances the modifier.

**Modifier prompt addendum (appended to the base Level 2 prompt):**
```
MODIFIER ACTIVE: "{modifier}"
Generate suggestions through this lens. All suggestions should lean toward
being {modifier}. Previous suggestions the user has already seen (do NOT
repeat any of these): {all_previously_shown_labels}
```

The modifier reroll produces a fresh cache of 8, so the user gets 3 more free RB rerolls after using X.

### 3.8 Empty State: Starter Suggestions

**When triggered:** User has 0 projects and lands on project select.

**Prompt:**
```
You are the new-user greeter for DeckForge, a gamepad-only coding app on Steam Deck.
This user has never built anything yet. Suggest 3 starter project ideas that are:
- Buildable in one session (30-60 minutes)
- Visually interesting (they should have something to show at the end)
- Progressively complex: first is dead simple, second is moderate, third is ambitious

For each:
- label: Project name (2-4 words)
- quip: A sassy pitch. Max 60 chars.
- pitch_prefill: The text that would be sent to Claude Code as the initial project pitch (1-2 sentences, specific)

Respond in JSON only.
```

---

## 4. RESPONSE CONTRACTS & VALIDATION

Every prediction response MUST be validated before rendering. The prediction engine module includes a response validator.

### 4.1 Validation Rules

```
FOR ALL RESPONSES:
  ✓ Response is valid JSON
  ✓ All required fields present
  ✓ No quip exceeds 60 chars (80 for exploration hooks)
  ✓ No label exceeds 6 words
  ✓ scope fields use valid enum values ("quick tweak" | "decent chunk" | "strap in")

FOR LEVEL 2 (Feature/Bug/TechDebt):
  ✓ suggestions[] has exactly 8 items
  ✓ wild_card exists
  ✓ modifier exists (Feature/TechDebt) or voice_escape exists (Bug)
  ✓ No two suggestion labels share >50% of words (diversity check)
  ✓ wild_card label shares <30% of words with any suggestion label (the Y-is-different check)
  ✓ Bug mode: voice_escape has is_voice_input: true

FOR LEVEL 3 (Plan):
  ✓ Steps are between 3 and 8
  ✓ scope is present
  ✓ claude_code_intent is present, non-empty, and contains NO specific file paths
  ✓ unhinged_modifier exists and is non-empty

FOR EXPLORATION:
  ✓ No suggested project label matches user's existing project names
  ✓ hook field is present and does not read like a feature list (heuristic: no commas listing features)

FOR QA:
  ✓ features_to_test has 3-6 items
  ✓ quick_test_suggestion is present
```

**The Y-is-different check explained:** Split the `wild_card.label` and each `suggestion.label` into word sets (lowercased, stop words removed). If the Jaccard similarity between wild_card and ANY suggestion exceeds 0.3, reject the response and retry. This prevents the LLM from generating a Y option that's just a slight rephrase of a regular suggestion.

### 4.2 Fallback Strategy

If a prediction call fails (API error, timeout, malformed JSON):

1. **Retry once** with the same prompt (network blips happen)
2. **If retry fails,** fall back to **cached suggestions** from the last successful call for this screen type
3. **If no cache exists,** show **hardcoded fallback options** (every screen has a set of 8 generic fallbacks baked into the app)
4. **Show a personality error message** on the right panel: "my brain short-circuited. here are some backup ideas."
5. **Never show a blank screen.** The user must always have ABXY options to press.

**Circuit breaker:** After 3 consecutive failures within 60 seconds, the prediction engine trips into "degraded mode" for 30 seconds. In degraded mode, ALL calls skip the network entirely and go straight to cache → hardcoded fallbacks. After the 30s cooldown, the next call attempts a real API request. If it succeeds, the circuit resets. If it fails, degraded mode extends for another 60 seconds. This prevents hammering a dead API and burning 4+ seconds of timeout per screen transition.

### 4.3 Response Time Budget

| Call Type | Target | Max Acceptable | Action if Exceeded |
|-----------|--------|---------------|-------------------|
| Level 2 suggestions | <800ms | 2000ms | Show loading spinner, then result |
| Level 3 plan | <1500ms | 3000ms | Show "cooking up a plan..." animation |
| Exploration ideas | <1000ms | 2500ms | Show loading with personality message |
| QA analysis | <2000ms | 5000ms | Show "inspecting your creation..." |
| Reroll | <800ms | 2000ms | Brief flash animation masks latency |
| Empty state starters | <1000ms | 2500ms | Hardcoded fallback after timeout |

---

## 5. THE FEEDBACK LOOP: Learning from User Behavior

The prediction engine doesn't have memory between calls, but DeckForge tracks user behavior locally and feeds it back as context. This is how predictions get better over time.

### 5.1 What Gets Tracked

```json
{
  "session_history": [
    {
      "timestamp": "...",
      "screen": "level_2_feature",
      "options_shown": ["Add search", "Add tags", "reroll:visual", "Mood ring notes"],
      "selected": "a",
      "time_to_select_ms": 2300,
      "rerolled": false
    },
    {
      "timestamp": "...",
      "screen": "level_3_plan",
      "plan_summary": "Add search and filtering",
      "selected": "a_ship_it",
      "time_to_select_ms": 4100
    }
  ],
  "aggregate": {
    "categories_selected": {"Feature": 8, "Bug": 3, "Tech Debt": 1, "Yolo": 0},
    "option_slot_preferences": {"a": 45, "b": 30, "x": 10, "y": 15},
    "avg_rerolls_before_selection": 0.8,
    "plans_approved_first_try_pct": 72,
    "plans_rejected_pct": 15,
    "plans_expanded_pct": 13,
    "avg_time_to_select_ms": 3200,
    "voice_usage_total": 0,
    "preferred_complexity": "medium",
    "features_user_has_rejected": ["dark mode", "user authentication"],
    "features_user_has_approved": ["search", "markdown support", "note editing"]
  }
}
```

### 5.2 How Behavior Feeds Back Into Prompts

The `user_behavior` section of the context payload is assembled from the aggregate data above. Key signals:

- **High reroll rate** → suggestions aren't resonating. The prompt gets an addendum: "Previous suggestions have been frequently rerolled. Try more diverse/unexpected options."
- **User always picks A** → they want the obvious choice. Weight option_a toward the most conventional suggestion.
- **User picks Y often** → they like chaos. Make option_y slightly more buildable (they might actually ship it).
- **User rejects plans often** → plans are too vague or too ambitious. Add to prompt: "User frequently rejects plans. Be more specific in step descriptions and more conservative in scope."
- **Features rejected before** → suppressed for 3 sessions, then allowed back into the suggestion pool with reduced priority. Rejection is a signal, not a life sentence. The user might reject "dark mode" in session 1 because they're focused on features, then want it in session 5 when they're in polish mode.
- **Fast selection time** → user is decisive, predictions are probably good. No adjustment needed.
- **Slow selection time + no reroll** → user is reading carefully but unsure. Options might be too similar. Add: "Make options more distinct from each other."

### 5.3 Per-Project vs. Global Behavior

Behavior is tracked at two levels:

- **Per-project:** What categories, features, and complexity levels the user picks for THIS project
- **Global:** Aggregate across all projects — overall preferences, general patterns

Both are included in the context payload. Per-project data takes priority for suggestions, global data fills gaps when a project is new.

---

## 6. PROMPT ENGINEERING PRINCIPLES

Rules that apply to ALL prediction engine prompts.

### 6.1 Response Format: JSON Only

Every prompt ends with "Respond in JSON only. No markdown, no explanation." This is non-negotiable. The prediction engine parses JSON responses programmatically. Natural language responses break the UI.

### 6.2 The Y Rule

Every prompt explicitly states that Y must be ridiculous/chaotic. But there are subtleties:

- **Y must be contextually relevant.** "Add a dancing banana" is lazy. "Add a mood ring to each note" is good because it riffs on the actual project.
- **Y must be technically buildable.** The joke is funnier if the AI can actually build it. "Add time travel" is impossible. "Add a notes-to-haiku converter" is absurd but Claude Code could actually make it.
- **The best Y options are secretly brilliant ideas wearing a funny hat.** The user should occasionally go "wait, that's actually... kind of genius?" That's the sweet spot. Y is absurd on the surface but surprisingly compelling if you think about it for 2 seconds.
- **Y should escalate across sessions.** If the user never picks Y, make it wilder to tempt them. If they pick Y often, lean into ideas that are both ridiculous AND genuinely useful — they've shown they'll ship chaos, so give them *good* chaos.
- **Y never fully stops being ridiculous.** Even "more buildable" Y options must have an absurd element. "Add sentiment analysis" is boring. "Add a mood ring that changes color based on note sentiment" is the same feature but ridiculous. Always the funny hat.

### 6.3 Quip Quality

Quips are the personality layer. Rules:

- Max 60 characters (must fit in the UI without wrapping)
- Tone: slightly sassy, self-aware, occasionally self-deprecating
- Never mean-spirited toward the user's project
- Reference the project specifically when possible ("your 400-line App.js" > "your code")
- Avoid cliches: no "let's gooo", no "to the moon", no "it's giving..."
- Think: a coworker who's funny but not trying too hard

### 6.4 Avoiding Repetition

The prediction engine is stateless, so it doesn't know what it suggested last time. DeckForge handles this by including previous suggestions in the prompt when relevant:

- **Reroll:** "Previous suggestions were: [A, B]. Do NOT repeat these."
- **Returning to Level 2 after rejecting a plan:** "User previously saw and rejected: [suggestion]. Offer different options."
- **Exploration mode pagination:** "Already shown ideas: [list]. Generate new ones."

### 6.5 Model Selection Guidance

Different calls can use different models for optimal cost/speed/quality:

| Call Type | Recommended Model Tier | Reasoning |
|-----------|----------------------|-----------|
| Level 2 suggestions | Fast (Haiku / Flash / 4o-mini) | Speed matters most, suggestions are short |
| Level 3 plan generation | Mid (Sonnet / Flash / 4o) | Needs better reasoning for plan steps and claude_code_intent |
| Bug detection | Mid (Sonnet / Flash / 4o) | Needs analytical depth to find real issues |
| Exploration ideas | Fast (Haiku / Flash / 4o-mini) | Creative but low-stakes |
| QA analysis | Mid (Sonnet / Flash / 4o) | Needs to reason about test coverage |
| Reroll | Fast (same as parent call) | Just regenerating, same difficulty |
| Empty state starters | Fast | One-time call, low complexity |

The user can override this in settings (e.g., "always use Sonnet for everything" if they want higher quality and don't mind the cost).

### 6.6 Cost Model

Users are paying for API calls. Transparency builds trust. Here's the math:

**Per-call costs (2,500 input tokens + 500 output tokens, approximate):**

| Model Tier | Example Models | Cost per Call |
|-----------|---------------|--------------|
| Fast | Haiku, Gemini Flash, GPT-4o-mini | ~$0.001 |
| Mid | Sonnet, GPT-4o | ~$0.01 |

**Typical session (30-60 min of building):**

| Action | Calls | Tier | Cost |
|--------|-------|------|------|
| Level 1 prefetch (3 categories) | 3 | Fast | $0.003 |
| Rerolls that exhaust cache (need fresh call) | ~2 | Fast | $0.002 |
| Level 3 plans generated | ~4 | Mid | $0.04 |
| Plan expansions | ~1 | Mid | $0.01 |
| QA mode | ~1 | Mid | $0.01 |
| **Total prediction engine cost** | **~11** | | **~$0.065** |

Plus Claude Code usage (the real cost): $0.50-$2.00/session depending on task complexity.

**Prediction engine is <5% of total session cost.** This should be surfaced in the UI — a small indicator in settings showing "Prediction cost this session: $0.07" builds trust and lets power users optimize.

**Cost guardrails:**
- Reroll rate limiting: after 3 consecutive rerolls that exhaust the 8-option cache, show a 2-second cooldown with "take a breath. or press RB again."
- Session budget warning: if prediction costs exceed $0.50 in a single session (unusual — would require ~50+ mid-tier calls), show a non-blocking notice.

---

## 7. CACHING & PERFORMANCE

### 7.1 What Gets Cached (Per-Category Invalidation)

Global hash-based invalidation is wasteful — a new feature commit shouldn't invalidate bug suggestions. Each category has its own invalidation triggers:

| Cache | Key | Invalidates When |
|-------|-----|-----------------|
| **Feature suggestions** | project + `features_hash` | New features detected, file tree structure change, or rejected-features list changes |
| **Bug suggestions** | project + `errors_hash` | Error count changes, recent file modifications, build output changes |
| **Tech Debt suggestions** | project + `quality_hash` | File sizes change, test count changes, dependency updates |
| **Exploration ideas** | category + global | User completes a new project (new context), weekly refresh |
| **Empty state starters** | global | Weekly refresh, or on new DeckForge version |
| **Level 3 plans** | NEVER cached | Always generated fresh (plan must reflect current project state) |
| **QA analysis** | project + `code_hash` | Any code file modified since last QA |

Each hash is computed from category-relevant fields only:
- `features_hash` = hash(detected_features + file_tree_structure + rejected_features_list)
- `errors_hash` = hash(error_count + last_modified_files + build_output_hash)
- `quality_hash` = hash(largest_file_sizes + test_file_count + dependency_versions)
- `code_hash` = hash(latest_commit_sha + uncommitted_changes)

### 7.2 Prefetching

When the user is on **Level 1**, DeckForge can prefetch Level 2 suggestions for ALL 4 categories in parallel. The user sees Level 1 for at least 1-2 seconds (reading + deciding), which is enough time for 4 parallel fast-model API calls to return.

```
User enters Level 1
  → Immediately fire 3 parallel prediction calls:
    - Feature suggestions (8 options)
    - Bug suggestions (8 options)
    - Tech Debt suggestions (8 options)
    - (Y/Yolo doesn't need prefetch — it's procedural)
  → By the time user presses A/B/X, results are already cached
  → Level 2 renders instantly (0ms perceived latency)
  → Each cached result contains 8 suggestions = 3 free rerolls per category
```

This is the single biggest UX win for the prediction engine. **Level 2 should feel instant.** And with 8 cached options per category, the user gets 3 rerolls before hitting the network — so the first ~12 button presses in a session are all instant.

**Prefetch deduplication:** If the user exits Level 1 (back to project select) and re-enters, don't re-prefetch if the per-category hashes haven't changed. This prevents wasted API calls from users bouncing in and out of Level 1.

### 7.3 Context Hash

To know when cached suggestions are stale, DeckForge computes a lightweight hash of the project context:

```
context_hash = hash(
  file_tree_summary +
  latest_commit_sha +
  error_count +
  detected_features_count
)
```

If the hash changes, all caches for that project are invalidated.

---

## 8. PROMPT-TO-CLAUDE-CODE BRIDGE

The most critical handoff in the system: translating a user-approved plan into a Claude Code prompt.

### 8.1 The `claude_code_intent` Field

Every Level 3 plan response includes a `claude_code_intent` field. This is the actual text sent to Claude Code's subprocess. It describes WHAT to build and WHY — at the intent level, not the implementation level.

**Why intent-level, not file-level?** The prediction engine runs on a fast/cheap model with only a project summary. It doesn't know that the component is called `NotesList` (with an S) or that styles live in `src/styles/` not `src/css/`. Claude Code reads the actual codebase and is far better at implementation details. Giving it wrong file paths just adds noise to its context. Instead, describe the desired outcome and let Claude Code figure out the route.

**Human-readable plan (shown to user):**
```
1. Add a search bar component above the note list
2. Implement fuzzy text matching on note titles and content
3. Add real-time filtering as the user types
4. Style the search bar to match existing design
5. Handle empty results with a helpful message
```

**Claude Code intent (sent to subprocess):**
```
Add search and filter functionality to the notes app. Users should be able to
type in a search bar above the note list and see results filter in real-time.
Match against both note titles and body content. Use simple text matching —
no external search library needed. Style consistently with the existing UI.
Show a friendly empty-results message when nothing matches.
```

The prediction engine writes both versions in the same call. The human version is step-by-step and scannable. The Claude Code version is outcome-focused with constraints and acceptance criteria.

### 8.2 Unhinged Modifier

If the user picks Y at Level 3 ("Ship it but unhinged"), the `unhinged_modifier` text is appended to the `claude_code_intent`:

```
{claude_code_intent}

ALSO: {unhinged_modifier}
```

This is how "Ship it but make it unhinged" actually works — the core plan stays the same, but Claude Code gets an extra creative directive tacked on.

### 8.3 Plan Expansion (X = "Tell me more")

If the user presses X at Level 3, DeckForge makes another prediction call:

**Prompt:**
```
The user wants more detail on this plan:

PLAN: {plan_json}
PROJECT CONTEXT: {context_payload}

Expand each step with:
- substeps: 2-3 specific actions per step
- files_affected: Which files will be created/modified
- risks: Anything that might go wrong

Keep the tone casual. This isn't a PRD — it's a friend explaining what they're about to do.

Respond in JSON only.
```

The expanded plan replaces the original on screen. The ABXY options stay the same (A=Ship it, B=Nah, X is now disabled or shows "that's all I got", Y=Unhinged).

---

## 9. LOGGING, TELEMETRY & RLHF PIPELINE

Every prediction call and every user action is gold for making the system better. DeckForge logs extensively from day one — not as an afterthought, but as a core architectural pillar. The goal: build an RLHF-ready dataset that pairs (prompt, response) with real user reward signals.

### 9.1 Observability Platform: Langfuse (Self-Hosted)

**Why Langfuse:** Open source (MIT license), self-hostable on Railway, has everything we need without vendor lock-in. Cheaper than LangSmith ($5-15/month self-hosted vs $25-100+/month managed). Built on ClickHouse, optimized for high-volume trace logging. 19K+ GitHub stars.

**Why NOT LangGraph:** LangGraph is for multi-agent orchestration and complex stateful workflows. DeckForge's prediction calls are simple request → response. LangGraph is a sledgehammer for a nail.

**Why NOT LangSmith:** Proprietary, more expensive, and we don't need the deep LangChain integration since we're making direct API calls. LangSmith would work but Langfuse gives us the same capabilities with full data ownership.

### 9.2 What Gets Logged

Every prediction engine call produces a **trace** in Langfuse:

```python
from langfuse import Langfuse

langfuse = Langfuse(
    public_key="...",
    secret_key="...",
    host="https://langfuse.your-railway-app.railway.app"
)

# Create a trace for this user session
trace = langfuse.trace(
    name="prediction_call",
    user_id=user_id,
    session_id=session_id,
    metadata={
        "project_name": "my-notes-app",
        "project_type": "node-web",
        "session_number": 4,
        "screen": "level_2_feature"
    }
)

# Log the LLM generation
generation = trace.generation(
    name="feature_suggestions",
    model="claude-3-5-haiku",
    model_parameters={"temperature": 0.8, "max_tokens": 1500},
    input=prompt_text,
    output=response_json,
    usage={
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "total_tokens": response.usage.total_tokens
    },
    metadata={
        "call_type": "level_2_feature",
        "context_hash": context_hash,
        "prefetched": True,
        "cache_hit": False,
        "latency_ms": latency
    }
)

# ... later, when the user makes a selection ...

# Log the user action as a "score" (reward signal)
trace.score(
    name="user_selection",
    value=1.0 if user_selected else 0.0,
    comment=f"User pressed {button} after {time_to_select_ms}ms",
    data_type="NUMERIC"
)

# Log detailed action metadata
trace.event(
    name="user_action",
    metadata={
        "button_pressed": "A",
        "suggestion_selected": "Add search & filter",
        "suggestion_index": 0,
        "time_to_select_ms": 2300,
        "reroll_count_before_selection": 0,
        "total_options_seen": 2,
        "plan_approved": True,
        "plan_approval_button": "A_ship_it",
        "used_unhinged_modifier": False
    }
)
```

### 9.3 The RLHF Data Model

Every prediction call produces a trainable data point:

```json
{
  "trace_id": "abc123",
  "timestamp": "2025-02-14T19:30:00Z",

  "input": {
    "prompt_template": "level_2_feature",
    "context_payload": { ... },
    "model": "claude-3-5-haiku",
    "full_prompt": "You are the suggestion engine for DeckForge..."
  },

  "output": {
    "suggestions": [ ... ],
    "wild_card": { ... },
    "modifier": { ... },
    "raw_response": "{ ... }"
  },

  "reward_signals": {
    "primary": {
      "selected": true,
      "selected_index": 0,
      "button": "A"
    },
    "secondary": {
      "time_to_select_ms": 2300,
      "rerolls_before_selection": 0,
      "plan_approved": true,
      "plan_approval_time_ms": 4100,
      "task_completed_successfully": true,
      "user_rolled_back": false
    },
    "computed_reward": 0.92
  }
}
```

**Reward signal computation:** Not just binary "did they pick it." A composite score:

| Signal | Weight | Logic |
|--------|--------|-------|
| User selected this suggestion | +0.5 | Binary: picked or not |
| Fast selection (<3s) | +0.1 | Quick pick = confident match |
| No rerolls needed | +0.1 | First suggestions resonated |
| Plan approved first try | +0.15 | Plan was good enough |
| Task completed (no rollback) | +0.15 | End-to-end success |
| Rerolled past this suggestion | -0.3 | User saw it and said "nah" |
| Plan rejected | -0.2 | Suggestion was fine but plan was bad |
| User used voice instead | -0.4 | Predictions completely failed |

This produces a reward score from -0.4 to 1.0 per suggestion, usable for RLHF fine-tuning or preference optimization (DPO).

### 9.4 Deployment: Railway

```
┌──────────────────────────────────────────────────┐
│                   Railway                         │
│                                                   │
│  ┌──────────────┐  ┌──────────────┐              │
│  │  DeckForge    │  │  Langfuse    │              │
│  │  API Backend  │  │  (self-hosted)│              │
│  │  (FastAPI)    │  │              │              │
│  │              │  │  Traces UI    │              │
│  │  - Prediction │  │  Datasets     │              │
│  │    proxy      │  │  Annotations  │              │
│  │  - Logging    │  │              │              │
│  │  - Auth       │  │              │              │
│  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                      │
│         └───────┬──────────┘                      │
│                 │                                  │
│         ┌───────▼───────┐                         │
│         │  PostgreSQL    │                         │
│         │  (Railway DB)  │                         │
│         └───────────────┘                         │
└──────────────────────────────────────────────────┘
         ▲
         │ HTTPS
         │
┌────────┴─────────┐
│  DeckForge App   │
│  (Tauri desktop) │
│  runs on Steam   │
│  Deck locally    │
└──────────────────┘
```

**Architecture:**
- **Tauri desktop app** runs locally on Steam Deck. Contains the UI, gamepad input, Claude Code subprocess, window management.
- **DeckForge API Backend** (FastAPI on Railway) handles: prediction engine calls (proxied through the backend so API keys stay server-side), Langfuse logging, user authentication, and serves the prediction engine prompts (so we can update prompts without shipping app updates).
- **Langfuse** (self-hosted on Railway) receives all traces from the backend.
- **PostgreSQL** (Railway-managed) stores Langfuse data + user accounts + project metadata.

**Why proxy prediction calls through the backend instead of calling LLM APIs directly from the Tauri app?**
1. API keys stay on the server, not on the user's device
2. Logging happens server-side (guaranteed, can't be lost to app crashes)
3. Prompt templates can be updated server-side without app updates (A/B testing!)
4. Rate limiting and cost guardrails enforced centrally
5. If we add RLHF fine-tuned models later, we can swap them in server-side

**Railway costs:**
- FastAPI backend: ~$5/month (small instance)
- Langfuse: ~$5-10/month (small instance + ClickHouse)
- PostgreSQL: ~$5/month (starter plan)
- **Total: ~$15-20/month**

### 9.5 A/B Testing (Built Into Logging)

Since prediction calls are proxied through the backend, A/B testing is straightforward:

1. Backend randomly assigns a model variant per-trace (e.g., 50% Haiku, 50% Flash)
2. Both variants are logged to Langfuse with `model` metadata
3. Reward signals attach to each trace
4. Query Langfuse: "average reward score for Haiku vs Flash on level_2_feature calls"
5. Winning model becomes the default

This is built into the logging architecture from day one — no separate A/B testing infrastructure needed.

### 9.6 Privacy & Data Minimization

**What goes to the backend (Railway):** Anonymized user ID, project type (not name), context payload (file tree structure, not file contents), prediction prompts and responses, action metadata (button presses, timing).

**What stays local (Steam Deck):** Full codebase, Claude Code conversation history, screenshots, API keys (if user opts for direct mode instead of proxied mode), personal project details.

**User opt-out:** Users can disable telemetry entirely. The app works fine without it — logging is write-only and never affects prediction quality in real-time. (It improves predictions over time via RLHF, but that's a backend model update, not a per-user thing.)

---

## 10. OPEN QUESTIONS

Things that need to be decided during implementation:

1. **API key management:** Where does the user configure their API key? If using the proxied backend, they might not need one at all (DeckForge provides the API access as part of the service). If self-hosting, first-run setup screen with a text input (the ONE time keyboard is expected).

2. **Offline fallback:** If there's no internet, both the prediction engine AND the backend are unreachable. DeckForge should gracefully degrade to cached suggestions + hardcoded fallbacks. Claude Code can still work offline for local codebases if the model is cached.

3. **Personality quips — generated or pre-written?** Resolution: **both.** The LLM generates contextual quips for suggestions (these NEED to reference the project). Pre-written human quips are for UI chrome: headers, loading messages, error messages, empty states — places where project context isn't needed. Every prompt template should explicitly note which quips are LLM-generated vs. selected from a pre-written pool.

4. **Pricing model:** If we proxy prediction calls through the backend, do we charge users a subscription? Or let them bring their own API keys? Or both (free tier with BYOK, paid tier with managed access)?
