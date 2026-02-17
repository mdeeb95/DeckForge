# Task: Terminal Audit — Kill All Placeholder Content

## Goal

Audit every screen that writes terminal entries and replace hardcoded filler with real data or remove it entirely. If a data source doesn't exist yet, show nothing rather than fake content.

## Screens to Fix

### 1. Level1Screen.svelte — CRITICAL (9 fake entries, 0 real)

The entire boot sequence in `onMount` is hardcoded. Every single entry is a static string.

**Current filler to remove/replace:**
- "Scanning project workspace..." → Should read actual `projectConfig.tech_stack`
- "Detected: TypeScript + React + Vite" → Should read `projectConfig.tech_stack.framework + language`
- "Git status: on branch main — clean" → Should run real git status or read cached result
- "Claude Code SDK connected ✓" → Should verify `claude --version` actually resolves
- "Prediction engine warming up..." → Should reflect actual backend auth status
- Context analysis: "47 files, 12 open issues, last commit 2h ago" → All fake numbers. Use real file count from tech_stack detection or remove
- Project summary code block: "3 features shipped, 1 bug fixed", "Test coverage: 74%", "Bundle size: 248kb", "Last deploy: 2 hours ago" → All hardcoded. Pull from `projectConfig.session_history` and `projectConfig.deploy` or remove entirely

**Fix approach:**
- Read `$projectConfig` store for tech stack, project name, session history
- Read `$globalConfig` for auth status (is backend connected?)
- For git status: use the existing `getGitStatus()` helper if it exists, or just show branch name from project config
- For file count: use `projectConfig.tech_stack.dependencies.length` or omit
- Remove any stat that isn't backed by real data — blank is better than fake
- Keep the splash/boot message randomizer (`getRandomMessage`) — that's personality, not fake data
- Keep the cursor "Awaiting category selection..." — that's a real UI state

### 2. ErrorScreen.svelte — CRITICAL (9 fake entries, 0 real)

The entire screen is a static mockup showing a hardcoded auth.ts TypeScript error.

**Fix approach:**
- ErrorScreen should receive error data via a store or navigation params
- The store should be populated by AIWorkingScreen when Claude Code fails
- Create an `errorDetails` store (or use existing `lastError` if one exists) with: `message`, `type`, `file`, `output`, `recoverable`
- ErrorScreen reads from this store and renders real error data
- If store is empty (direct navigation), show a generic "No error details available" message
- The X button "View Full Error" should expand real error output, not hardcoded text

### 3. ExplorationScreen.svelte — MEDIUM (3 filler entries, 0 real)

All button actions show "not yet implemented" placeholder messages.

**Fix approach:**
- If Exploration mode isn't ready, make the buttons honest: show "Coming soon" in the card description
- Remove the fake terminal entries from onMount — show just a cursor: "Exploration mode — coming soon"
- OR wire the A button to actually launch a Claude Code session with an exploration prompt (the subprocess system already works)

### 4. Minor Fixes (Low Priority)

- **Level2Screen** cursor message: "Select A or B, or press RB to reroll..." — This is a real UI instruction, keep it
- **Level3Screen** cursor message: "Awaiting confirmation..." — Real UI state, keep it
- **QAMode** static headers: "QA Review" and "Test Results" — These are section labels, keep them

## Design Rule

**If it's not real data, don't show it.** A terminal with 3 real lines is better than a terminal with 12 fake lines. Users will immediately spot that "47 files, 12 open issues" doesn't match their project.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/screens/Level1Screen.svelte` | Replace boot sequence with real projectConfig data |
| `src/lib/screens/ErrorScreen.svelte` | Wire to error store, remove all hardcoded error text |
| `src/lib/screens/ExplorationScreen.svelte` | Remove fake entries, show honest "coming soon" or wire real exploration |

## Verification

1. Open a real project → L1 boot sequence shows actual tech stack, real git branch, real session count
2. No entry on any screen contains text that doesn't match the actual project state
3. ErrorScreen shows real error data when navigated to from a failed AI task
4. ExplorationScreen doesn't pretend features exist that don't
