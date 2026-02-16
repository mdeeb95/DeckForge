# DeckForge — Sequenced Claude Code Build Prompts

**How to use this document:** Copy each prompt into Claude Code one at a time, in order. Each prompt builds on the previous one. Wait for Claude Code to finish and verify the result before moving to the next prompt.

**Important:** Before starting, make sure the `docs/` and `mockups/` folders from this repo are in the project root. Claude Code will reference them.

---

## PROMPT 1 — Scaffold Tauri 2 + Svelte + Tailwind

```
Initialize a new Tauri 2 project with a Svelte frontend. Use the official Tauri CLI to scaffold it.

Project name: deckforge
Frontend: Svelte (not SvelteKit — plain Svelte with Vite)
Language: TypeScript for Svelte, Rust for Tauri backend

After scaffolding:
1. Install Tailwind CSS 3 with PostCSS and autoprefixer
2. Configure tailwind.config.js with EXACTLY these custom values (copy verbatim from docs/deckforge-style-guide.md section 12 "TAILWIND CONFIG"):
   - colors: primary #0df2f2, primary-dim #089090, secondary #f20dcf, background-dark #0d1117, surface-dark #161b22, surface-border #30363d
   - fontFamily: display ["Space Grotesk", "sans-serif"], mono ["JetBrains Mono", "monospace"]
   - borderRadius: DEFAULT "0.125rem", lg "0.25rem", xl "0.5rem", full "9999px"
   - darkMode: "class"
3. Add Google Fonts imports to index.html: Space Grotesk (300-700) and JetBrains Mono (400,500,700)
4. Add Material Icons and Material Symbols Outlined imports to index.html
5. Set the window size in tauri.conf.json to 1280x800, not resizable, no decorations (frameless)
6. Set the window title to "DeckForge"
7. Create a global.css with these custom styles (copy from docs/deckforge-style-guide.md sections 5.7, 5.8, 8):
   - Custom scrollbar (6px, #30363d thumb, #0df2f2 hover)
   - .glass-panel class (rgba(22,27,34,0.95) + backdrop-filter blur(8px))
   - .scan-overlay class (scanline gradient)
   - Code syntax highlight classes (.code-syntax-keyword, .code-syntax-string, .code-syntax-function, .code-syntax-comment)
   - selection:bg-primary selection:text-black on body
8. Set body classes: bg-background-dark text-slate-300 font-display h-screen w-screen overflow-hidden

Verify: `npm run tauri dev` launches a 1280x800 frameless dark window with the correct background color.
```

---

## PROMPT 2 — Base Layout Shell

```
Read docs/deckforge-style-guide.md section 4 (LAYOUT) and the mockup at mockups/mockup-level1-category-select.html for reference.

Build the base layout shell in App.svelte. This is the persistent chrome that every screen shares:

1. STATUS BAR (top):
   - h-8, border-b border-surface-border, bg-surface-dark
   - Flex row, justify-between, px-4, text-xs font-mono uppercase tracking-wider
   - Left: DeckForge logo (Material Icon "terminal" + "DeckForge" in text-primary font-bold), pipe separator, project name slot, pipe, connection status with pulsing dot
   - Right: RAM %, CPU %, version in text-primary
   - Make this a <StatusBar /> component in src/lib/components/StatusBar.svelte
   - Props: projectName (string), connected (boolean), version (string)

2. MAIN AREA (flex-1, flex row):
   - Left panel: flex-1, border-r border-surface-border, bg-background-dark, relative (for scanline overlay)
   - Right panel: w-[320px] md:w-[380px], bg-surface-dark, shadow-2xl, flex-col
   - These should be <TerminalPanel /> and <ActionPalette /> components
   - Include the scanline overlay div (absolute inset-0, scan-overlay class, z-10, pointer-events-none, opacity-20) inside the terminal panel

3. FLOATING BOTTOM HUD (absolute positioned over main):
   - absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none
   - Glass panel with rounded-full, border-surface-border/50, shadow-2xl, px-6 py-2
   - Show button hints: START=Menu, SELECT=Focus Log, D-pad=Nav
   - Make this a <BottomHUD /> component
   - Props: hints (array of {key: string, label: string})

4. Create a simple Svelte store in src/lib/stores/app.ts:
   - currentScreen: string (default "level1")
   - projectName: string (default "")
   - connected: boolean (default false)

Verify: the app shows the split-panel layout with status bar and floating HUD. Everything should match the visual structure in the mockups.
```

---

## PROMPT 3 — Terminal Panel Component

```
Read docs/deckforge-style-guide.md sections 5.2, 5.3 and look at mockups/mockup-level1-category-select.html for the terminal panel structure.

Build src/lib/components/TerminalPanel.svelte — the left panel showing Claude Code output.

1. TERMINAL HEADER (inside the panel, top):
   - h-10, flex, items-center, justify-between, px-4, border-b border-surface-border, bg-surface-dark/50
   - Left side: "> Claude Code Stream" in text-primary font-mono text-sm, plus a status badge
   - Status badge variants: STREAMING (bg-primary/20 text-primary border-primary/30), IDLE (bg-slate-800 text-slate-500 border-slate-700), COMPLETE (bg-emerald-400/20 text-emerald-400 border-emerald-400/30), ERROR (bg-red-400/20 text-red-400 border-red-400/30)
   - Right side: cost pill and scope pill (rounded-full bg-slate-800 border-surface-border text-[10px] text-slate-400)
   - Props: status ("streaming"|"idle"|"complete"|"error"), cost (string), scope (string)

2. TERMINAL CONTENT (scrollable area):
   - flex-1, overflow-y-auto, p-4, font-mono text-xs leading-relaxed
   - This component receives an array of "terminal entries" and renders them
   - Entry types:
     a. "timestamp" — flex gap-2: timestamp in text-slate-600 select-none + message in text-slate-500
     b. "prompt" — left border accent (border-l-2 border-primary/50), label in text-primary font-bold, body in text-slate-200
     c. "thought" — label in text-secondary font-bold, body in text-slate-400 with inline code refs (bg-slate-800 px-1 rounded text-slate-300)
     d. "code" — bg-[#0b0e11] border-surface-border rounded p-3, with file path label top-right, supports diff lines (text-green-500 with + prefix)
     e. "cursor" — pulsing cursor block (w-2 h-4 bg-primary animate-pulse) + waiting message in text-slate-400
   - Props: entries (array of typed objects), status (for cursor color)

3. Create a terminal store in src/lib/stores/terminal.ts:
   - entries: array of terminal entry objects
   - status: string
   - cost: string
   - scope: string
   - addEntry(entry) function
   - clear() function

Verify: render some sample terminal entries and confirm they match the visual style in the mockups.
```

---

## PROMPT 4 — Action Card Components

```
Read docs/deckforge-style-guide.md section 5.4 (Action Cards) VERY carefully. Every class must match exactly.

Build the action card system in src/lib/components/:

1. ActionCard.svelte — the main reusable card:
   Props: button (string "A"|"B"|"X"|"Y"), title (string), description (string), pills (array of {label, variant}), selected (boolean), variant ("primary"|"secondary_pink"|"neutral"|"amber")

   SELECTED state (when selected=true):
   - Outer wrapper: relative group cursor-pointer
   - Left accent bar: absolute -left-2 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(13,242,242,0.6)] rounded-r
   - Card body: bg-[#1c242e] border-2 border-primary/50 p-3 rounded shadow-lg relative overflow-hidden transition-all
   - Corner badge: absolute top-0 right-0 p-1.5 bg-primary text-black rounded-bl font-bold text-xs
   - Title: text-primary font-bold text-sm mb-1 pr-6
   - Description: text-xs text-slate-300 leading-snug mb-2
   - Pills: bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 text-[10px]

   UNSELECTED state (selected=false):
   - Outer wrapper: relative group opacity-80 hover:opacity-100 transition-opacity
   - NO left accent bar
   - Card body: bg-surface-dark border border-surface-border hover:border-slate-600 p-3 rounded relative transition-all
   - Corner badge: absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full font-bold text-[10px]
     - variant="secondary_pink": bg-secondary/20 text-secondary border-secondary/30
     - variant="neutral": bg-slate-700 text-slate-300 border-slate-600
     - variant="amber": bg-amber-500/20 text-amber-400 border-amber-500/30
   - Title: text-white font-medium text-sm mb-1 pr-6
   - Description: text-xs text-slate-400 leading-snug mb-2
   - Pills: bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-surface-border text-[10px]

2. SecondaryCard.svelte — for RB/LB actions:
   Props: button (string), label (string), icon (string — Material Icon name)
   - bg-[#13171e] border border-dashed border-slate-700 p-2 rounded flex items-center justify-between hover:bg-surface-dark transition-colors cursor-pointer
   - Badge: bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-600
   - Label: text-xs text-slate-300 font-medium
   - Icon: material-icons text-slate-500 text-sm (right side)

3. ActionPalette.svelte — the right panel container:
   Props: title (string), subtitle (string), cards (array), secondaryCards (array), selectedIndex (number)
   - Header: p-3 border-b border-surface-border bg-surface-dark. Title in text-xs font-bold text-slate-400 uppercase tracking-widest. Subtitle in text-[10px] text-slate-600
   - Card list: flex-1 overflow-y-auto p-2 space-y-2
   - Separator between main and secondary cards: h-px bg-surface-border my-1
   - Bottom hint: p-2 bg-[#0b0e11] border-t border-surface-border text-center, text-[10px] text-slate-500 font-mono

Verify: render 4 action cards (A selected, B/X/Y unselected) plus 2 secondary cards. Compare pixel-by-pixel to mockups/mockup-level1-category-select.html.
```

---

## PROMPT 5 — Screen System + Level 1 Category Select

```
Read docs/deckforge-requirements.md section 0.3 and docs/deckforge-input-map.md section 5 for Level 1 behavior. Look at mockups/mockup-level1-category-select.html for the visual.

Build a screen routing system and the first real screen:

1. Screen Router (src/lib/components/ScreenRouter.svelte):
   - Reads currentScreen from the app store
   - Renders the appropriate screen component
   - Screens: "level1", "level2", "level3", "project_select", "empty_state", "ai_working", "qa_mode", "deploy_mode", "history", "exploration", "voice_pitch", "error"
   - Use Svelte's {#if} blocks (not a router library — this is a single-page gamepad app, not a website)

2. Level 1 Screen (src/lib/screens/Level1Screen.svelte):
   - This is the "What Are We Doing?" screen
   - Terminal panel shows: boot sequence timestamps, system ready message, context info about the project, pulsing cursor "Awaiting category selection..."
   - Action palette shows 4 category cards:
     - A (selected by default): "Feature" — "build something new" — pill: suggestion count
     - B: "Bug" — "fix something broken" — pill: suggestion count
     - X: "Tech Debt" — "pay down the mess" — pill: suggestion count
     - Y: "Yolo" — "surprise me, I'm feeling lucky" — pill: suggestion count
   - Secondary cards: RB="Reroll All Predictions" (refresh icon), LB="Project Settings" (settings icon)
   - Per the style guide section 13: on Level 1, ALL four badges get branded colors (A=cyan, B=pink, X=neutral, Y=amber)

3. Navigation state for Level 1:
   - selectedIndex: 0-3 (which card is selected, 0=A initially)
   - D-pad up/down changes selectedIndex
   - Only ONE card is "selected" at a time — the selected card gets the full cyan accent treatment
   - This is NOT keyboard-driven yet — just wire it up with the store for now

4. Update the app store:
   - Add selectedCardIndex: number
   - Add a navigate(screen: string) function that sets currentScreen

Verify: App shows Level 1 with 4 cards, the first one selected with cyan glow. Terminal shows boot messages. Visual should match the mockup exactly.
```

---

## PROMPT 6 — Level 2 Feature Select + Level 3 Plan Confirmation

```
Read docs/deckforge-requirements.md sections 0.3 and 0.4. Read docs/deckforge-input-map.md sections 6 and 9. Look at docs/deckforge-style-reference.html (the approved Level 2 mockup) and mockups/mockup-level3-plan-confirmation.html.

Build the Level 2 and Level 3 screens:

1. Level 2 Screen (src/lib/screens/Level2Screen.svelte):
   - Props: category (string — which category was selected at Level 1)
   - Terminal panel: show the user prompt "Refactor the user list component..." style block, AI thought process, code diff block — use the exact content from docs/deckforge-style-reference.html for now (static placeholder data)
   - Action palette title: "Suggestions" / "Select an action to apply changes"
   - 4 main cards with placeholder suggestions:
     - A (selected): high-impact suggestion with pills
     - B: secondary suggestion
     - X: reroll/modifier suggestion
     - Y: wildcard (the ridiculous one — always italic, personality-driven)
   - Secondary: RB="Reroll All Suggestions" (refresh), LB="Explain Selection" (question_answer)
   - Per style guide: on Level 2+, X and Y badges are neutral slate (not branded)
   - Navigation: selectedIndex 0-3, D-pad moves selection

2. Level 3 Screen (src/lib/screens/Level3Screen.svelte):
   - Terminal panel: show a numbered plan with steps (1. Analyze current component... 2. Create SearchInput.tsx... 3. Add unit tests...)
   - Each plan step is a div with a number badge and description
   - Selected step has left border accent (border-l-2 border-primary)
   - Action palette:
     - A (selected): "Ship It" — "Approve this plan and let Claude Code execute it."
     - B: "Nah, Go Back" — "Reject this plan and return to suggestions."
     - X: "Tell Me More" — "Expand the plan with substeps, risks, and affected files."
     - Y: "Ship It Unhinged" — "Approve with extra creative freedom. YOLO modifier applied."
   - Secondary: RB="Modify Plan" (edit_note), LB="Back to Categories" (arrow_back)

3. Wire up navigation between screens:
   - Level 1: pressing A navigates to Level 2 (pass category="feature")
   - Level 2: pressing A on a suggestion navigates to Level 3
   - Level 3: pressing B goes back to Level 2, pressing A goes to "ai_working"
   - Use the app store's navigate() function
   - For now, "pressing A" means clicking the card — gamepad input comes later

Verify: you can click through Level 1 → Level 2 → Level 3 and back. All three screens render with correct styles matching the mockups.
```

---

## PROMPT 7 — All Remaining Screens (Static)

```
Build all remaining screens as static Svelte components. Each screen follows the same component patterns established in Prompts 2-6. Reference the corresponding mockup HTML file for exact visual structure.

For each screen, create src/lib/screens/<Name>Screen.svelte:

1. ProjectSelectScreen — FULL WIDTH (no split panel). Reference: mockups/mockup-project-select.html
   - List of project cards with name, tech stack, last session, git status
   - A=Open project, B=Delete, X=Exploration Mode, Y=New Project (Voice Pitch)

2. EmptyStateScreen — FULL WIDTH. Reference: mockups/mockup-empty-state.html
   - Centered DeckForge logo with glow, "No Projects Found" message
   - A=Open Directory, B=Paste Path, X=Clone from Git, Y=Demo Mode
   - Secondary: LB=Settings, RB=Help

3. AIWorkingScreen — SPLIT PANEL. Reference: mockups/mockup-ai-working.html
   - Terminal streams Claude Code output (use placeholder content)
   - Right panel: progress tracker with numbered steps, checkmarks, progress bar (bg-primary fill on bg-slate-800 track), elapsed time
   - Only B="Interrupt" as action card

4. QAModeScreen — SPLIT PANEL. Reference: mockups/mockup-qa-mode.html
   - Terminal: execution log with Created/Modified lines, diff block, test results with progress bar
   - A="Approve and Commit", B="Reject Changes", X="Run Tests Again", Y="View Full Diff"

5. DeployModeScreen — SPLIT PANEL. Reference: mockups/mockup-deploy-mode.html
   - Terminal: git status, commit log (unpushed), pre-flight checks (all green), deploy target config block
   - A="Push and Deploy", B="Preview Deploy", X="Push Only", Y="Review Changes"
   - Secondary: RB="Change Deploy Target", LB="Deploy History"

6. HistoryScreen — SPLIT PANEL. Reference: mockups/mockup-history-timeline.html
   - Terminal: git log timeline
   - Right panel: commit entries with timestamps, diff previews
   - A=Preview, B=Back, Y=Rollback

7. ExplorationScreen — FULL WIDTH. Reference: mockups/mockup-exploration-mode.html
   - Category tabs (Games, Tools, Art+Creative, Just For Fun, Surprise Me)
   - Project idea cards with descriptions
   - A=Build, B=Back, X=More Ideas, Y=Shuffle

8. VoicePitchScreen — FULL WIDTH. Reference: mockups/mockup-voice-pitch.html
   - Large microphone indicator, "What are we building?" prompt
   - Recording state UI (waveform placeholder, timer)
   - A=Confirm, B=Re-record/Back

9. ErrorScreen — SPLIT PANEL (red-tinted). Reference: mockups/mockup-error-state.html
   - Red accent on selected card (bg-red-400 glow instead of cyan)
   - Terminal: error output with red-tinted code block border
   - A="Retry with Fix", B="Undo and Go Back", X="View Error Details", Y="Ignore and Continue"

All screens use static placeholder data. Wire each one into the ScreenRouter. Add a debug keyboard shortcut (number keys 1-9) to quickly switch between screens during development.

Verify: every screen renders and matches its mockup. All screens are accessible via the debug shortcuts.
```

---

## PROMPT 8 — Gamepad Input System

```
Read docs/deckforge-input-map.md for the complete button mapping across all 22 screens. Read docs/deckforge-requirements.md section 0.5 for gamepad hardware details.

Build the gamepad input system:

1. Create src/lib/input/gamepad.ts — the core input handler:
   - Use the Web Gamepad API (navigator.getGamepads()) as the primary input method
   - Poll at 60fps via requestAnimationFrame
   - Map Steam Deck button indices to semantic names: A, B, X, Y, LB, RB, LT, RT, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, START, SELECT, L_STICK, R_STICK
   - Steam Deck uses standard Xbox layout mapping in the Gamepad API
   - Emit events on button DOWN (not hold — single press per press, with debounce)
   - Support button combos: detect LB held + other button (for LB+A voice, LB+D-pad resize)
   - Export a Svelte store: gamepadConnected (boolean), lastButton (string)

2. Create src/lib/input/inputRouter.ts — routes gamepad events to screen actions:
   - Reads currentScreen from app store
   - Maps button presses to screen-specific actions based on docs/deckforge-input-map.md
   - Each screen registers its own handler: { A: () => ..., B: () => ..., DPAD_UP: () => ..., etc. }
   - Global bindings (RT/LT window switch, LB+D-pad resize) are always active
   - Combo detection: if LB is held, route to combo handler instead of single-press handler

3. Create src/lib/input/navigation.ts — manages card selection within screens:
   - selectedIndex: which card is currently selected (0-based)
   - maxIndex: how many selectable cards exist on this screen
   - DPAD_UP: selectedIndex = Math.max(0, selectedIndex - 1)
   - DPAD_DOWN: selectedIndex = Math.min(maxIndex - 1, selectedIndex + 1)
   - A button: trigger the action for the selected card
   - Wrapping: when at top and pressing up, stay at top (no wrap)

4. Wire gamepad input to Level 1:
   - DPAD_UP/DOWN moves selectedIndex (the visual selection on cards updates)
   - A button navigates to Level 2 with the selected category
   - B is no-op at Level 1
   - Menu button → QA Mode
   - View button → History

5. Add keyboard fallback for development (when no gamepad connected):
   - Arrow keys = D-pad
   - Enter = A, Escape = B, Q = X, E = Y
   - Tab = RB, Shift = LB
   - This is for development only — not shown in the UI

Verify: connect a gamepad (or use keyboard fallback) and navigate Level 1. D-pad moves selection, A selects and navigates to Level 2. Pressing B on Level 2 goes back to Level 1.
```

---

## PROMPT 9 — Wire Gamepad to All Screens

```
Read docs/deckforge-input-map.md for the COMPLETE button mapping for every screen.

Wire up gamepad/keyboard input to every screen:

For each screen, implement the button handlers per the input map doc. The key mappings are:

LEVEL 1: A/B/X/Y = select category → Level 2. Menu = QA Mode. View = History.
LEVEL 2: A = select suggestion → Level 3. B = back to Level 1. RB = reroll (cycle selectedIndex). LB = back.
LEVEL 3: A = "Ship it" → AI Working. B = reject → Level 2. X = expand plan. Y = ship unhinged → AI Working.
AI WORKING: B = interrupt (with confirmation). All others disabled.
QA MODE: A = approve → Deploy. B = back to Level 1. X = run tests. Y = view diff. D-pad navigates.
DEPLOY MODE: A = push and deploy. B = preview. X = push only. Y = review changes. Menu = back to Level 1.
HISTORY: A = preview. B = back to Level 1. Y = rollback.
PROJECT SELECT: A = open project → Level 1. B = delete. X = exploration. Y = new project.
EMPTY STATE: A = open directory. X = exploration. Y = new project.
EXPLORATION: A = build. B = back. X = more. Y = shuffle. D-pad left/right = categories, up/down = within category.
VOICE PITCH: A = confirm. B = re-record/back.
ERROR: A = retry. B = undo. X = view details. Y = ignore.

Also implement:
- GLOBAL: R-stick Y-axis scrolls the terminal panel (left side). Use a scrollTop store variable that the TerminalPanel reads.
- GLOBAL: LB + D-pad left/right adjusts split ratio (5% increments). Store the ratio in the app store. Min 20%, max 80%.
- Screen transitions should be instant (no animation yet).

Verify: every screen responds to the correct buttons. Navigate the full flow: Level 1 → Level 2 → Level 3 → AI Working. Press B to go back at each level.
```

---

## PROMPT 10 — Local Data Model

```
Read docs/deckforge-data-model.md COMPLETELY. This is the source of truth for every piece of data DeckForge stores.

Implement the local data layer:

1. Create src/lib/data/config.ts — reads/writes JSON config files using Tauri's fs API:
   - Use @tauri-apps/plugin-fs for file system access
   - Functions:
     - loadGlobalConfig(): reads ~/.config/deckforge/global.json, returns typed object
     - saveGlobalConfig(config): writes back
     - loadProjectConfig(projectPath): reads <path>/.deckforge/project.json
     - saveProjectConfig(projectPath, config)
     - loadBehavior(projectPath): reads .deckforge/behavior.json
     - saveBehavior(projectPath, behavior)
   - Each function validates schema_version. If file doesn't exist, create with defaults.

2. Create TypeScript interfaces in src/lib/types/data.ts matching the data model doc:
   - GlobalConfig (section 1: user, prediction_engine, claude_code, display, input, telemetry, cost_tracking)
   - ProjectConfig (section 4: project, tech_stack, run_config, deploy, display, input, claude_code, features_detected, session_history)
   - ProjectBehavior (section 5: aggregate, rejection_history, approval_history, session_events)
   - PredictionCache (section 6: category, invalidation_hash, cached_at, response, display_state)
   - TerminalEntry, ActionCardData, and other UI types

3. Create src/lib/data/defaults.ts — default values for new configs:
   - Default global config with all fields from section 1
   - Default project config template
   - Default behavior file

4. Create Svelte stores in src/lib/stores/:
   - globalConfig store (writable, loaded from file on app start)
   - projectConfig store (writable, loaded when a project is opened)
   - projectBehavior store (writable, loaded with project)

5. App initialization flow in App.svelte:
   - On mount: load global config
   - If no global config exists: create with defaults, show Empty State
   - If global config exists but no projects: show Empty State
   - If projects exist: show Project Select

Verify: app launches, creates ~/.config/deckforge/ directory and global.json with correct defaults. Opening a project directory creates the .deckforge/ folder structure.
```

---

## PROMPT 11 — Claude Code SDK Integration

```
Read docs/deckforge-requirements.md section 0.1 (Claude Code Subprocess) for the full specification.

Integrate Claude Code as a subprocess:

1. Install claude-code-sdk-python in a Python sidecar or use the Node.js SDK (@anthropic-ai/claude-code) directly.

   Preferred approach: Use the Node.js SDK since we're already in a Node/TypeScript environment.

   npm install @anthropic-ai/claude-code

2. Create src/lib/claude/subprocess.ts:
   - startSession(projectPath, systemPromptAppend): spawns Claude Code with:
     - system_prompt: { content: "The user strongly prefers not to type — handle everything yourself. They CAN use a keyboard but it's a last resort. Provide clear progress updates. This project is controlled via a gamepad interface.", mode: "append" }
     - acceptEdits: true
     - allowed_tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash(git *)", "Bash(npm *)", "Bash(npx *)"]
   - sendPrompt(prompt: string): sends a prompt to the active session
   - onOutput(callback): streams JSON output events to a callback
   - interrupt(): cancels the current operation
   - resumeSession(sessionId): resumes a previous session

3. Create src/lib/claude/streamParser.ts:
   - Parses Claude Code's streaming JSON output into TerminalEntry objects
   - Maps Claude Code events to our entry types:
     - "assistant" messages → "thought" entries
     - Tool use (file edits) → "code" entries with diffs
     - Tool results → "timestamp" entries
     - Completion → "cursor" entry with completion message
   - Extracts cost data from the stream for the terminal header

4. Wire it up to the AI Working screen:
   - When Level 3 "Ship It" is pressed, call sendPrompt() with the approved plan text
   - Stream output to the terminal panel in real-time
   - Update progress steps on the right panel as Claude Code completes each step
   - When complete, transition to QA Mode screen

5. Create src/lib/claude/claudeMd.ts:
   - generateClaudeMd(projectConfig): creates the .claude/CLAUDE.md content
   - Template matches docs/deckforge-data-model.md section 8
   - Called on project creation and when tech stack detection changes

Verify: selecting "Ship It" on Level 3 spawns Claude Code, streams output to the terminal, and shows real progress. Use a test project directory.
```

---

## PROMPT 12 — Prediction Engine Client

```
Read docs/deckforge-prediction-engine.md COMPLETELY — this is the most detailed design doc and the prediction engine is the heart of the right panel.

Build the prediction engine client (local side only — no backend yet):

1. Create src/lib/prediction/contextAssembler.ts:
   - buildContextPayload(projectConfig, behavior): assembles the context JSON payload from local data
   - Reads file tree (via Tauri fs API): summary, top_level, largest_files, recently_modified
   - Reads git history (via Tauri shell API): recent_commits, current_branch, uncommitted_changes, total_deckforge_commits
   - Merges: detected_features from projectConfig, detected_gaps (heuristic), current_errors (cached), tech_stack, user_behavior from behavior aggregate
   - Token budget: serialized payload must stay under 2000 tokens. Implement truncation priority from the prediction engine doc section 2.4.

2. Create src/lib/prediction/client.ts:
   - This is the API client that will eventually call the FastAPI backend
   - For now, implement a LOCAL MOCK mode that returns realistic fake suggestions
   - Interface: predictSuggestions(category, context): returns { header_quip, suggestions[8], modifier, wild_card }
   - Each suggestion: { label, quip, scope, estimated_time, tools, detail, plan_steps[], rationale }
   - Mock data should feel realistic for a TypeScript/React project
   - The mock should return different suggestions per category (feature vs bug vs tech_debt)

3. Create src/lib/prediction/cache.ts:
   - Implements the caching system from prediction engine doc section 7
   - Cache per category in .deckforge/cache/<category>_suggestions.json
   - Hash-based invalidation: compute hash of (detected_features + file_tree + rejected_features)
   - Display state tracking: current_pair_index, pairs_exhausted, previously_shown_labels
   - Reroll logic: RB press cycles current_pair_index through cached pairs [0-1], [2-3], [4-5], [6-7], then triggers fresh API call

4. Wire predictions to Level 2:
   - When entering Level 2, check cache first, then call prediction client if cache miss
   - Display suggestions[current_pair_index * 2] as card A, suggestions[current_pair_index * 2 + 1] as card B
   - Display modifier suggestion as card X
   - Display wild_card as card Y (always italic quip, always ridiculous)
   - RB reroll: increment pair index, update display

5. Wire predictions to Level 3:
   - When a suggestion is selected at Level 2, use its plan_steps to populate Level 3
   - Show numbered plan steps in the terminal panel
   - Show estimated time, scope, and affected files

Verify: navigate to Level 2 and see generated suggestions. Press RB to cycle through cached pairs. Select a suggestion and see its plan at Level 3.
```

---

## PROMPT 13 — FastAPI Backend

```
Read docs/deckforge-requirements.md section on TECHNICAL STACK and docs/deckforge-prediction-engine.md for the full prediction API specification.

Build the FastAPI backend in a /backend directory at the project root:

1. Scaffold:
   - Python 3.11+, FastAPI, uvicorn, httpx (for LLM API calls), python-dotenv
   - requirements.txt with all dependencies
   - .env.example with: ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_URL, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_HOST

2. API routes (backend/app/routes/):

   POST /api/v1/predict
   - Body: { call_type, context_payload, user_id, preferences }
   - call_type: "level_2_feature", "level_2_bug", "level_2_tech_debt", "level_3_plan", "level_3_expand", "exploration", "qa_analysis", "deploy_preflight", "empty_state"
   - Loads the active prompt_template for this call_type from the database
   - Merges context_payload into the template
   - Calls the LLM API (Anthropic by default, configurable)
   - Logs the call to Langfuse (trace + generation)
   - Logs cost to prediction_calls table
   - Returns the structured JSON response

   POST /api/v1/feedback
   - Body: { trace_id, user_action, selection_speed_ms, selected_index, reroll_count }
   - Logs a Langfuse score (user_selection + computed_reward)

   GET /api/v1/templates
   - Returns active prompt templates (for client-side caching)

   POST /api/v1/auth/register
   - Creates an anonymous user, returns JWT

   POST /api/v1/auth/refresh
   - Refreshes JWT token

3. Prompt template system (backend/app/prompts/):
   - Load templates from the database (prompt_templates table)
   - Each template has named slots for context injection: {project_context}, {user_behavior}, {detected_features}, etc.
   - Create seed templates for: level_2_feature, level_2_bug, level_2_tech_debt, level_3_plan
   - The level_2_feature template should follow the EXACT prompt structure from docs/deckforge-prediction-engine.md section 3

4. LLM client (backend/app/llm/):
   - Support Anthropic (Claude), OpenAI, and Google Gemini
   - Use the call_type to determine which model tier to use:
     - Fast tier (Level 2): claude-3-5-haiku, gpt-4o-mini, gemini-2.0-flash
     - Mid tier (Level 3): claude-sonnet, gpt-4o, gemini-pro
   - Structured output parsing: the LLM response MUST be valid JSON matching our response schema
   - Retry once on parse failure, then return fallback

5. Database setup (backend/app/db/):
   - SQLAlchemy models matching docs/deckforge-data-model.md section 9 (PostgreSQL schema)
   - Tables: users, auth_tokens, api_keys, prompt_templates, project_sync, prediction_calls, circuit_breaker_state
   - Alembic migrations
   - Seed data: initial prompt templates

6. Create a Dockerfile and railway.toml for deployment.

Verify: run the backend locally, hit POST /api/v1/predict with a sample context payload, get back structured suggestions. The response should have 8 suggestions, each with label, quip, scope, plan_steps.
```

---

## PROMPT 13.5 — Test Suite Setup (Safety Net)

```
Set up an automated test suite before wiring frontend to backend. This catches regressions as we integrate real API calls.

1. Install test dependencies:
   npm install -D vitest @testing-library/svelte @testing-library/jest-dom jsdom

2. Create vitest.config.ts at project root:
   - Environment: jsdom
   - Include: src/**/*.test.ts
   - Setup files: src/test/setup.ts
   - Resolve alias: $lib → src/lib
   - Exclude: src-tauri, node_modules, backend

3. Create src/test/setup.ts:
   - Import @testing-library/jest-dom
   - Mock @tauri-apps/plugin-fs (readTextFile, writeTextFile, mkdir, exists — return defaults)
   - Mock @tauri-apps/plugin-shell (Command — return empty stdout)
   - Mock @tauri-apps/api/path (homeDir → /tmp/test-home)
   - Set window.__TAURI_INTERNALS__ = {} so isTauri() returns true in tests

4. Create src/test/stores/app.test.ts — App state tests:
   - Test: navigate() sets currentScreen and resets selectedCardIndex to 0
   - Test: navigate() clears screenCards
   - Test: splitRatio stays within 20-80 bounds
   - Test: all 12 Screen type values are valid

5. Create src/test/stores/terminal.test.ts — Terminal store tests:
   - Test: addEntry() appends to entries array
   - Test: clear() empties entries array
   - Test: entries starts empty (no duplication bug)
   - Test: all 5 entry types (timestamp, prompt, thought, code, cursor) are accepted

6. Create src/test/input/navigation.test.ts — Navigation tests:
   - Test: navigateUp() decrements selectedCardIndex (stops at 0)
   - Test: navigateDown() increments selectedCardIndex (stops at max)
   - Test: activateByButton('A') calls onclick of the A card
   - Test: cycleSelectedIndex() wraps around to 0

7. Create src/test/input/inputRouter.test.ts — Input routing tests:
   - Test: Level 1 A/B/X/Y buttons trigger navigation to level2
   - Test: Level 2 B goes back to level1
   - Test: Level 3 A navigates to ai_working
   - Test: Level 3 B goes back to level2
   - Test: LB_DPAD_LEFT decreases splitRatio by 5
   - Test: LB_DPAD_RIGHT increases splitRatio by 5
   - Test: unknown buttons don't throw

8. Create src/test/prediction/cache.test.ts — Prediction cache tests:
   - Test: setCached() stores and getCached() retrieves
   - Test: getCached() returns null when hash changes (invalidation)
   - Test: getCurrentPair() returns correct pair for current_pair_index
   - Test: advancePair() cycles through pairs 0-3 then returns false
   - Test: clearCategory() only clears specified category
   - Test: clearAll() empties everything

9. Create src/test/data/config.test.ts — Config tests:
   - Test: loadGlobalConfig() returns valid defaults when no file exists
   - Test: createDefaultGlobalConfig() has all required fields
   - Test: createDefaultProjectConfig() has deploy section
   - Test: schema_version matches CURRENT_SCHEMA_VERSION

10. Add to package.json scripts:
    "test": "vitest run",
    "test:watch": "vitest"

Verify: `npm test` passes all tests. Every test file runs without errors. Add a summary comment at the top of each test file explaining what it covers.
```

---

## PROMPT 14 — Wire Frontend to Backend

```
Connect the Svelte frontend to the FastAPI backend:

1. Update src/lib/prediction/client.ts:
   - Add a "remote" mode alongside the existing "mock" mode
   - Remote mode calls POST /api/v1/predict on the backend
   - Read the backend URL from global config (prediction_engine.backend_url or auth.json backend_url)
   - Include JWT auth token in Authorization header
   - Handle network errors gracefully: if backend is unreachable, fall back to mock mode with a warning in the terminal

2. Update src/lib/prediction/cache.ts:
   - After a successful remote prediction, cache the response locally
   - On app start, always try cache first, then remote

3. Create src/lib/auth/auth.ts:
   - On first launch (no auth.json exists): call POST /api/v1/auth/register to get a JWT
   - Store token in ~/.config/deckforge/auth.json
   - Auto-refresh token when near expiry
   - Include anonymized_user_id (sha256 of local UUID) in registration

4. Implement feedback loop:
   - When user selects a suggestion at Level 2, call POST /api/v1/feedback
   - Send: trace_id from the prediction response, which button was pressed, time_to_select_ms, reroll_count
   - This is fire-and-forget (don't block the UI on feedback calls)

5. Update behavior tracking:
   - When a suggestion is selected, update .deckforge/behavior.json:
     - Increment categories_selected counter
     - Increment option_slot_preferences for the selected button
     - Add to session_events array
     - Update avg_time_to_select_ms
   - When a plan is approved/rejected at Level 3, update approval_history or rejection_history

6. Cost tracking:
   - Parse cost from prediction responses
   - Update the terminal header cost display
   - Accumulate session cost in the app store
   - Show warning when approaching session_budget_warning_threshold_usd from global config

Verify: full flow works end-to-end. Level 1 → Level 2 (loads real predictions from backend) → Level 3 (plan from selected suggestion) → behavior is tracked locally and feedback is sent to backend.
```

---

## PROMPT 15 — Window Switching + App Launcher

```
Read docs/deckforge-requirements.md sections 0.6 and 0.7.

Implement window management and app launching:

1. Window Switching (src/lib/system/windowManager.ts):
   - Use Tauri's shell API to run system commands
   - RT button: switch to the app being built
     - Run: wlrctl toplevel focus <window_class> (Wayland) or wmctrl -a <window_class> (X11)
     - Detect Wayland vs X11 at startup
   - LT button: switch back to DeckForge
     - Run: wlrctl toplevel focus DeckForge (or equivalent)
   - Track the app's window class/ID (stored in project config run_config.window_class)
   - On first app launch, detect the window class automatically

2. App Launcher (src/lib/system/appLauncher.ts):
   - autoDetectRunCommand(projectPath): scan for:
     - package.json → scripts.dev or scripts.start
     - Makefile → first target
     - main.py → "python main.py"
     - index.html → "npx serve ."
     - Cargo.toml → "cargo run"
     - project.godot → "godot --path ."
   - launchApp(command, cwd): spawn the process, track PID
   - killApp(): terminate the running app process
   - restartApp(): kill + relaunch
   - Store the detected/configured command in project config run_config.command

3. Wire to gamepad:
   - RT (global): call windowManager.switchToApp()
   - LT (global): call windowManager.switchToDeckForge()
   - R4 back grip (default): call appLauncher.restartApp()

4. Wire to project setup:
   - When opening a project for the first time, run autoDetectRunCommand()
   - If auto-detect fails, show a simple config screen (or prompt via terminal)
   - Save to project config

Verify: open a project with a package.json, verify it detects "npm run dev". Launch the app, press RT to switch to it, LT to switch back.
```

---

## PROMPT 16 — Screenshot + Voice Input

```
Read docs/deckforge-requirements.md sections 1.1 and 1.4.

Implement screenshot capture and voice input:

1. Screenshot Capture (src/lib/system/screenshot.ts):
   - RB button triggers capture (on Main HUD and AI Working screens)
   - Use Tauri shell to run: grim (Wayland) or scrot (X11) — save to .deckforge/screenshots/
   - Filename: ISO timestamp .png
   - Create metadata sidecar .meta.json (captured_at, session_number, source_window)
   - Flash overlay effect: briefly show a white overlay at 30% opacity that fades out (200ms)
   - After capture, show Screenshot Feedback screen:
     - A = send to Claude Code context
     - LB+A = voice annotate
     - B = discard
     - Y = send + trigger new task

2. Voice Input (src/lib/system/voice.ts):
   - LB+A combo (hold to record, release to transcribe)
   - Use whisper.cpp via Tauri shell command (must be installed on the system)
   - Alternatively, use the Web Speech API as a simpler fallback for development
   - Record audio to a temp file while LB+A is held
   - On release, run whisper.cpp on the audio file
   - Return transcription text
   - Available on: Voice Pitch screen (primary input), Bug Level 2 X-button, Screenshot Feedback

3. Voice Pitch Screen integration:
   - Update VoicePitchScreen to use the voice system
   - Show recording state: large pulsing microphone icon, timer counting up
   - On transcription complete: show the text, A to confirm, B to re-record
   - On confirm: use the transcription as the initial prompt for Claude Code to scaffold a new project

Verify: press RB on Level 1 to capture a screenshot. The flash overlay appears, screenshot is saved to .deckforge/screenshots/. Voice input works on the Voice Pitch screen (test with Web Speech API fallback if whisper.cpp isn't available).
```

---

## PROMPT 17 — Deploy Mode (Live)

```
Read docs/deckforge-requirements.md section 1.7 (Deploy Mode) and docs/deckforge-data-model.md deploy section in project.json.

Make the Deploy Mode screen functional:

1. Create src/lib/deploy/deployer.ts:
   - detectDeployConfig(projectPath): scan for vercel.json, railway.toml, netlify.toml, .github/workflows
   - getGitStatus(): returns { branch, commits_ahead, files_changed, has_conflicts }
   - runPreflightChecks(projectConfig): returns array of { label, passed, detail }
     - Check: tests passing (run test command from run_config)
     - Check: no lint errors (run lint command if available)
     - Check: TypeScript clean (if tsconfig exists, run tsc --noEmit)
     - Check: no merge conflicts with target branch
   - pushAndDeploy(config): git merge to target branch + git push + trigger deploy
   - previewDeploy(config): git push branch + deploy to preview URL
   - pushOnly(config): git push -u origin <branch>

2. Git operations (src/lib/deploy/git.ts):
   - All git ops via Tauri shell API
   - getUnpushedCommits(): returns commit list with sha, message, timestamp, files_changed, insertions, deletions
   - mergeBranch(source, target): merge source into target
   - pushBranch(branch): push to origin
   - createPR(title, body): use gh CLI if available, fallback to just pushing

3. Deploy provider integration (src/lib/deploy/providers/):
   - VercelProvider: use vercel CLI or Vercel API for deploy status polling
   - RailwayProvider: use railway CLI for deploy
   - GenericProvider: just git push (for GitHub Pages, Netlify auto-deploy, etc.)
   - Each provider implements: deploy(), getStatus(), getPreviewUrl()

4. Wire to DeployModeScreen:
   - On screen enter: run getGitStatus() and runPreflightChecks(), display in terminal
   - A button: call pushAndDeploy(), stream output to terminal, show deploy status
   - B button: call previewDeploy()
   - X button: call pushOnly()
   - After successful deploy: show deploy URL in terminal, update project config last_deploy

5. Deploy config setup:
   - If deploy.provider is null in project config, show a setup prompt the first time
   - Auto-detect from config files, let user confirm or override
   - Save to project.json deploy section

Verify: in a test project with a git repo, the deploy screen shows accurate git status, commits ahead, and pre-flight checks. Push Only successfully pushes the branch.
```

---

## PROMPT 18 — QA Mode (Live)

```
Read docs/deckforge-requirements.md section 1.2.

Make QA Mode functional:

1. Create src/lib/qa/qaRunner.ts:
   - runTests(projectConfig): execute the test command from run_config
   - Parse test output: extract pass/fail counts, individual test names, durations
   - Support common test runners: jest, vitest, pytest, cargo test
   - Return structured results: { total, passed, failed, skipped, tests[] }

2. Create src/lib/qa/qaAnalyzer.ts:
   - After tests run, use the prediction engine to analyze results
   - Send test output + project context to POST /api/v1/predict with call_type: "qa_analysis"
   - Get back: suggested fixes for failures, overall assessment, risk areas

3. Wire to QAModeScreen:
   - On screen enter: run tests automatically, stream output to terminal
   - Show test results: green checkmarks for pass, red X for fail
   - Progress bar: bg-emerald-400 fill proportional to pass rate
   - Card A: "Approve and Commit" — create a git commit with the changes
   - Card B: "Reject Changes" — git checkout to revert all changes
   - Card X: "Run Tests Again" — re-run the test suite
   - Card Y: "View Full Diff" — show git diff in terminal
   - After Approve: if deploy is configured, offer to go to Deploy Mode

4. Auto-commit on approval:
   - Generate commit message from the plan summary (tagged [DeckForge])
   - Run: git add -A && git commit -m "<message>"
   - This is the git-backed undo mechanism

Verify: after AI Working completes, QA Mode runs tests and shows results. Approving creates a git commit. Rejecting reverts changes.
```

---

## PROMPT 19 — History / Undo System

```
Read docs/deckforge-requirements.md section 1.3 and docs/deckforge-input-map.md sections 14-15.

Make the History screen functional:

1. Create src/lib/history/timeline.ts:
   - getTimeline(projectPath): reads git log for [DeckForge]-tagged commits
   - Returns: array of { sha, message, timestamp, files_changed, insertions, deletions, is_current }
   - Each entry represents one completed DeckForge task

2. Create src/lib/history/rollback.ts:
   - previewRollback(sha): returns what will be undone (list of commits between HEAD and target)
   - executeRollback(sha): runs git revert or git reset --soft back to the target commit
   - Safety: never hard-reset. Use revert commits so the rollback itself is undoable.

3. Wire to HistoryScreen:
   - Load timeline on screen enter, display in right panel as scrollable list
   - D-pad navigates entries
   - A = preview: show the diff for that commit in the terminal
   - Y = rollback: show rollback confirmation with what will be undone
   - Rollback confirmation: A = confirm, B = cancel
   - After rollback: return to Level 1

Verify: make some changes via DeckForge, view them in History, preview a commit, rollback to a previous state.
```

---

## PROMPT 20 — Polish + Animations + Quirky Messages

```
Read docs/deckforge-requirements.md section 2.1 (Quirky Messages) and section 2.4 (Visual Polish).

Add the finishing touches:

1. Transitions between screens:
   - Card selection: transition-all duration-150 on all cards (smooth highlight/unhighlight)
   - Screen transitions: subtle fade (opacity 0→1, 100ms)
   - Terminal scroll: scroll-smooth on the content area

2. Visual effects:
   - Pulsing border effect when AI is working (scanline overlay pulses between opacity-10 and opacity-30)
   - Green flash on screenshot capture (full-screen emerald overlay, 0→30%→0 opacity over 200ms)
   - Progress bar animations (transition-all on width changes)
   - Selection glow on cards: the cyan left accent bar shadow pulses subtly

3. Quirky messages system (src/lib/personality/messages.ts):
   - Create arrays of pre-written messages for each context:
     - splash_messages: 20+ welcome messages ("Let's build something stupid together.", "Your couch, your code, your rules.")
     - loading_messages: 30+ working messages ("teaching electrons to dance", "asking the AI nicely", "canoodling with your code")
     - empty_state_messages: 10+ ("You have no projects. That's either zen or sad.", "This is a blank canvas. No pressure.")
     - error_quips: 10+ ("Well that didn't work.", "The code fought back.", "It's not a bug, it's a surprise feature.")
   - Export a getRandomMessage(category) function
   - Messages rotate on each screen visit (never show the same one twice in a row)

4. Loading states:
   - When predictions are loading: show a skeleton card UI (pulsing bg-slate-800 blocks where text would be)
   - Terminal "thinking" indicator: three dots animation (...) in text-primary

5. Sound effects (optional, skip if complex):
   - If easy to implement: subtle click sound on card selection, success chime on task complete
   - Use Web Audio API, very short samples

Verify: navigate the app and confirm all transitions are smooth. Screen changes feel polished. Quirky messages appear in appropriate places. Loading states show properly when predictions are fetching.
```

---

## PROMPT 21 — Langfuse Integration

```
Read docs/deckforge-prediction-engine.md section 9 (RLHF + Scoring) and docs/deckforge-data-model.md section 10.

Add Langfuse observability to the backend:

1. Install langfuse SDK in the backend: pip install langfuse

2. Update backend/app/llm/ to log every prediction call to Langfuse:
   - Create a trace per prediction call with: name="prediction_call", user_id=anonymized_id, session_id, metadata (project_type, session_number, screen)
   - Create a generation nested under the trace: model, input (full prompt), output (full response), usage (token counts), metadata (call_type, context_hash, latency_ms, cache_hit)

3. Log scores on feedback:
   - When POST /api/v1/feedback is called, add scores to the trace:
     - user_selection: 1.0 if user picked a suggestion, 0.0 if rerolled or went back
     - computed_reward: composite score from prediction engine doc section 9.3
     - selection_speed: milliseconds to select

4. Log events for detailed user actions:
   - Button pressed, suggestion selected, time to select, reroll count

5. Create a Langfuse project setup script (backend/scripts/setup_langfuse.py):
   - Initialize the Langfuse client
   - Verify connection
   - Print the dashboard URL

Verify: make prediction calls and check the Langfuse dashboard. Traces appear with generations, scores, and events.
```

---

## PROMPT 22 — Railway Deployment

```
Deploy the FastAPI backend to Railway:

1. Backend Dockerfile (backend/Dockerfile):
   - Python 3.11 slim base
   - Copy requirements.txt, install deps
   - Copy app code
   - CMD: uvicorn app.main:app --host 0.0.0.0 --port $PORT

2. Railway configuration:
   - railway.toml at backend root
   - Environment variables needed: DATABASE_URL, ANTHROPIC_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_HOST
   - Health check endpoint: GET /health

3. PostgreSQL setup:
   - Create a Railway PostgreSQL service
   - Run Alembic migrations on deploy (add to Dockerfile CMD or use a release command)
   - Seed initial prompt templates

4. Langfuse setup:
   - Add Langfuse as a Railway service (use their Docker image: langfuse/langfuse)
   - Connect it to the same PostgreSQL instance (or a separate one)
   - Set LANGFUSE_HOST in the backend env vars to point to the Langfuse Railway URL

5. Update the frontend:
   - Set the default backend_url in auth.json to the Railway URL
   - Ensure HTTPS is used for all API calls

6. Create a deploy script (scripts/deploy-backend.sh):
   - railway up from the backend directory
   - Run migrations
   - Verify health endpoint

Verify: backend is running on Railway. Frontend connects, makes prediction calls, and receives responses. Langfuse dashboard shows traces.
```

---

## PROMPT 23 — Tauri Build + Flatpak Packaging

```
Package DeckForge for the Steam Deck:

1. Tauri build configuration (tauri.conf.json):
   - Set identifier: com.deckforge.app
   - Set all window properties: 1280x800, not resizable, fullscreen: false, decorations: false
   - Bundle: set Linux target to AppImage and deb

2. Build the app:
   - npm run tauri build
   - Verify the binary runs on a Linux x86_64 system

3. Flatpak manifest (com.deckforge.app.yml):
   - Create a Flatpak manifest for Steam Deck distribution
   - Runtime: org.freedesktop.Platform 23.08
   - Include system dependencies: SDL2 (for gamepad), whisper.cpp (for voice)
   - Set permissions: gamepad access, network access, filesystem access to ~/projects
   - Build the Flatpak: flatpak-builder

4. Steam Deck specific:
   - Create a .desktop file for Game Mode
   - Set the icon (create a simple DeckForge icon — cyan terminal icon on dark background)
   - Configure as a non-Steam game shortcut

5. Create a Makefile with targets:
   - make dev: npm run tauri dev
   - make build: npm run tauri build
   - make flatpak: build the Flatpak
   - make backend: cd backend && uvicorn app.main:app --reload
   - make deploy: deploy backend to Railway

Verify: the built app runs as a standalone binary on Linux. The Flatpak installs and launches on Steam Deck.
```

---

## DEPENDENCY MAP

```
PROMPT 1 (scaffold) ─── required by everything else
    │
    ├── PROMPT 2 (layout shell)
    │     ├── PROMPT 3 (terminal panel)
    │     ├── PROMPT 4 (action cards)
    │     │     └── PROMPT 5 (Level 1 screen)
    │     │           └── PROMPT 6 (Level 2 + 3)
    │     │                 └── PROMPT 7 (all remaining screens)
    │     │
    │     └── PROMPT 8 (gamepad input)
    │           └── PROMPT 9 (wire all screens)
    │
    ├── PROMPT 10 (data model) ─── required by 11-19
    │     ├── PROMPT 11 (Claude Code SDK)
    │     ├── PROMPT 12 (prediction client)
    │     │     └── PROMPT 14 (wire to backend)
    │     └── PROMPT 15 (window switching)
    │
    ├── PROMPT 13 (FastAPI backend)
    │     ├── PROMPT 14 (wire frontend)
    │     ├── PROMPT 21 (Langfuse)
    │     └── PROMPT 22 (Railway deploy)
    │
    ├── PROMPT 16 (screenshot + voice)
    ├── PROMPT 17 (deploy mode live)
    ├── PROMPT 18 (QA mode live)
    ├── PROMPT 19 (history/undo)
    ├── PROMPT 20 (polish)
    │
    └── PROMPT 23 (packaging) ─── do last
```

**Suggested execution order for fastest visible progress:**
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 12 → 11 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24

---

## PROMPT 24 — Demo Project: Local Network Pong

```
DeckForge has a "Demo Mode" option on the Empty State screen (Y button). When the user selects it, DeckForge should scaffold a sample project and open it so the user can experience the full DeckForge workflow without having their own codebase ready.

The demo project is a local network multiplayer Pong game.

1. Create a demo project template in src/lib/demo/pong-template/:
   This is a pre-built project that gets copied into ~/projects/pong-demo/ when the user hits Demo Mode.

2. The Pong game itself (the template content):

   Tech: Node.js server with WebSocket (ws library) for relay. Single HTML file served by the same Node server. No build tools, no frameworks, no dependencies besides ws and express.

   server.js:
   - Express serves the HTML client on GET /
   - WebSocket server on the same port
   - Game room: first connection = Player 1 (left paddle), second = Player 2 (right paddle). Third+ spectate.
   - Server is authoritative: runs physics at 60fps, broadcasts state to both clients
   - Game state: ball position + velocity, paddle 1 Y, paddle 2 Y, scores
   - Ball: constant speed, angle changes on paddle hit (center = straight, edges = steep). Speed increases slightly after each hit.
   - Score: first to 11. 2-second pause after each point, ball serves toward the scorer.
   - Receive paddle input from clients: "up" and "down" booleans, server moves paddles at fixed speed

   index.html (served by express):
   - Canvas rendering, black background, white elements (classic Pong)
   - Responsive: fills viewport, scales proportionally
   - Touch controls: left half = up, right half = down (works on Steam Deck in browser)
   - Keyboard: arrow keys or W/S
   - Shows: paddles, ball, dashed center line, scores, connection status
   - Waiting state: "Waiting for opponent..." with local IP + port
   - Send input every frame, interpolate received state

   package.json:
   - name: "pong-demo"
   - scripts: { "dev": "node server.js", "start": "node server.js" }
   - dependencies: { "express": "^4", "ws": "^8" }

   Keep it under 300 lines total.

3. Demo Mode flow in DeckForge:
   - When user presses Y on Empty State → copy template to ~/projects/pong-demo/
   - Run npm install in the new project directory
   - Create .deckforge/project.json with:
     - name: "pong-demo"
     - created_via: "demo_mode"
     - tech_stack: { type_detected: "node-web", framework: "Express", language: "JavaScript" }
     - run_config: { command: "node server.js", port: 3000 }
   - Generate .claude/CLAUDE.md
   - Open the project in DeckForge (navigate to Level 1)
   - The prediction engine should immediately have interesting suggestions for the Pong game:
     preload the cache with suggestions like "Add power-ups", "Add particle effects on ball hit", "Add AI opponent for single player", "Add a lobby system with room codes"

4. This serves as the first-run experience and the proof that DeckForge works end-to-end.

Verify: launch DeckForge with no projects. Press Y for Demo Mode. Pong project is created, opened in DeckForge, and Level 1 shows with predictions ready. The user can pick "Feature" → see Pong-specific suggestions → approve a plan → watch Claude Code enhance the Pong game.
```
