# Tasks

## Active
- [ ] **Terminal Fidelity — Full Claude Code Output** - Show tool call headers (⏺ Read/Write/Edit/Bash), diffs, command output, real-time cost. Kill "CLAUDE" label spam.
  - Prompt: `tasks/todo/prompt-terminal-fidelity.md`
- [ ] **Fix Demo Mode Button** - Y button on EmptyState fails silently. Add diagnostics, fix scaffolder, fix PATH for npm.
  - Prompt: `tasks/todo/prompt-fix-demo-mode.md`
- [ ] **Move Bottom HUD Into Right Panel** - Remove floating bar, add compact HintGrid to each screen's right panel footer.
  - Prompt: `tasks/todo/prompt-bottom-hud-cleanup.md`
- [ ] **Run App Button + Keyboard Shortcut** - Add visible Run App button to L1, keyboard shortcut `r` for R4, show running status
  - Prompt: `tasks/todo/prompt-run-app-button.md`
- [ ] **Universal Card Animations** - Every card on every screen gets an activation animation (glitch, confirm, dismiss, pulse)
  - Prompt: `tasks/todo/prompt-universal-card-animations.md`
- [ ] **Fix Expand Plan — Backend Schema** - PlanStep Pydantic model strips substeps/files_affected/risks. Backend needs optional rich fields.
  - Prompt: `tasks/todo/prompt-fix-expand-plan-backend.md`
- [ ] **Warp Zoom Card Switch Animation** - D-pad navigation: deselecting card warp-zooms out, newly selected card warp-zooms in with spring settle. Includes terminal auto-scroll fix.
  - Prompt: `tasks/todo/prompt-warp-zoom-card-switch.md`
- [ ] **App Output Tab in Terminal Panel** - Two tabs (Claude Code / App Output), SELECT toggles, auto-switch on app launch
  - Prompt: `tasks/todo/prompt-app-output-tab.md`
- [ ] **Screen-Scoped Network Cancellation** - AbortController per screen. Navigate away = all in-flight fetches die. No orphaned promises writing to stores.
  - Prompt: `tasks/todo/prompt-screen-scoped-abort.md`

## Waiting On

## Someday
- [ ] **Back grip mapping** - L4/L5/R4/R5 configurable per project

## Done
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
