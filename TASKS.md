# Tasks

## Active
- [ ] **Screen-Scoped Network Cancellation** - AbortController per screen. Navigate away = all in-flight fetches die. No orphaned promises writing to stores.
  - Prompt: `tasks/todo/prompt-screen-scoped-abort.md`
- [ ] **Recent Projects Memory** - Persist recently-opened projects in global.json, render real data on ProjectSelectScreen instead of hardcoded demo list.
  - Prompt: `tasks/todo/prompt-recent-projects-memory.md`
- [ ] **Steam Deck Build** - Compile release binary, create portable bundle with launch script, deploy to Deck as non-Steam game.
  - Prompt: `tasks/todo/prompt-steam-deck-build.md`
- [ ] **Settings Screen** - Gamepad-navigable settings UI: API key input (direct mode), display prefs, input bindings, cost thresholds, model overrides.
  - Prompt: `tasks/todo/prompt-settings-screen.md`
- [ ] **Terminal Audit — Kill Placeholders** - L1 boot sequence is 100% fake, ErrorScreen is a static mockup, ExplorationScreen is a stub. Replace with real data or remove.
  - Prompt: `tasks/todo/prompt-terminal-audit-kill-placeholders.md`

## Waiting On

## Someday
- [ ] **Back grip mapping** - L4/L5/R4/R5 configurable per project

## Done
- [x] **Terminal Fidelity — Full Claude Code Output** - Tool call headers, diffs, command output, real-time cost (Feb 17)
- [x] **Fix Demo Mode Button** - Y button on EmptyState diagnostics + scaffolder + PATH fix (Feb 17)
- [x] **Move Bottom HUD Into Right Panel** - Removed floating bar, added compact HintGrid to right panel footer (Feb 17)
- [x] **Run App Button + Keyboard Shortcut** - Visible Run App button on L1, R4 shortcut, running status (Feb 17)
- [x] **Universal Card Animations** - Every card on every screen: glitch, confirm, dismiss, pulse (Feb 17)
- [x] **Fix Expand Plan — Backend Schema** - PlanStep Pydantic model with substeps/files_affected/risks (Feb 17)
- [x] **Warp Zoom Card Switch Animation** - D-pad warp-zoom transitions + terminal auto-scroll fix (Feb 17)
- [x] **App Output Tab in Terminal Panel** - Two tabs, SELECT toggles, auto-switch on app launch (Feb 17)
- [x] **Fix Streaming Pipeline — PTY + Env** - Wrap claude in `script` pseudo-TTY + unset CLAUDECODE to fix zero-stdout (Feb 17)
- [x] **Tell Me More — Progressive Plan Refinement** - Wire X button on L3 to call backend `level_3_expand` with progressive depth. Each press digs deeper.
- [x] **Ship It Button Animation** - Alternating Glitch Warp / Confirm Pulse animation on A and Y before navigating to ai_working (~450ms)
- [x] **~~**Fix Subprocess Streaming + CLI Args**~~ - Line buffer fix + --allowed-tools kebab-case (Feb 17)**
- [x] **~~**Langfuse Observability for Claude Code Sessions**~~ - POST session reports to Langfuse after every CC run (Feb 17)**
- [x] **QA pass + deploy** - Prompts 17-24: QA, deploy, packaging, Pong demo
- [x] **~~** - Fix Tauri Permission Errors** - Multiple permission errors blocking FS and shell access~~ (Feb 16)**
- [x] **~~** - Dev Observability System + Demo Mode Fix** - Structured devLog, emitDiag, fixed silent Demo Mode failures~~ (Feb 16)**
- [x] **~~** - Disable L3 Cards Until Plan Ready** - Prevent Ship It while plan is still generating~~ (Feb 16)**
- [x] **~~** - Fix Project Path (cwd) Safety** - Stale cwd in project.json caused Claude Code to run in wrong directory~~ (Feb 16)**
- [x] **~~** - E2E Screen Interaction Testing + Fixes** - Gamepad navigation, screen flow, broken screen fixes~~ (Feb 16)**
