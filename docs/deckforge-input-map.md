# DeckForge — Complete Gamepad Input Map

**Every button, every screen, one reference.** If a button isn't listed for a screen, it does nothing on that screen (no accidental actions). Unmapped buttons are silently ignored.

---

## HARDWARE REFERENCE: Steam Deck Controls

```
              [LB]  [RB]                    [LB]  [RB]
              [LT]  [RT]                    [LT]  [RT]

    [L-Stick]          [R-Stick]       [D-pad]         [Y]
       ↕↔                 ↕↔             ↑↓←→        [X] [B]
                                                       [A]

  [L4] [L5]     [View] [Menu]     [R4] [R5]
  (back grips)   (☰)    (≡)      (back grips)

              [Steam]                [...]
```

---

## GLOBAL BINDINGS (active on ALL screens)

These work regardless of which screen is displayed. Screen-specific bindings take priority if there's a conflict.

| Button | Action | Notes |
|--------|--------|-------|
| **RT** | Switch to app being built | Fullscreen, DeckForge yields focus. Via wlrctl/wmctrl |
| **LT** | Switch back to DeckForge | Returns from app to DeckForge |
| **LB + D-pad ←/→** | Resize split panels | 5% per tap, smooth scroll if held. Divider glows when active |
| **LB + D-pad ↑/↓** | Jump to split presets | Snaps to 30/70, 40/60, 50/50, 60/40, 70/30 |
| **R-stick ↕** | Scroll left panel (terminal) | Claude Code output, read-only |
| **L4** | Quick QA | Default back grip binding (configurable) |
| **L5** | Undo (open history) | Default back grip binding (configurable) |
| **R4** | Restart app | Default back grip binding (configurable) |
| **R5** | Commit checkpoint | Default back grip binding (configurable) |
| **Steam** | Open settings | System-level, DeckForge settings overlay |

---

## SCREEN-BY-SCREEN INPUT MAP

### 1. Splash Screen

Minimal — just waiting for the user to proceed.

| Button | Action |
|--------|--------|
| **A** | Continue to Project Select |
| **Any button** | Continue to Project Select |

---

### 2. Project Select

Navigate and manage existing projects.

| Button | Action |
|--------|--------|
| **D-pad ↑/↓** | Navigate project list |
| **A** | Open selected project → Main HUD (Level 1) |
| **B** | Delete selected project (opens confirmation) |
| **X** | Enter Exploration Mode |
| **Y** | Create new project → Voice Pitch screen |
| **L-stick ↕** | Scroll project list (if long) |
| **Menu (≡)** | No action (QA only available inside a project) |

---

### 3. Empty State (no projects)

Shown when the user has zero projects. 3 AI-suggested starter ideas displayed.

| Button | Action |
|--------|--------|
| **D-pad ↑/↓** | Navigate between the 3 starter ideas |
| **A** | Build the selected idea (pre-fills pitch, jumps to Claude Code init) |
| **X** | Enter Exploration Mode |
| **Y** | Create new project → Voice Pitch screen |
| **RB** | Refresh starter ideas (new generation) |

---

### 4. Voice Pitch (New Project)

"What are we building?" — the ONE screen where voice is encouraged.

| Button | Action |
|--------|--------|
| **LB + A** (hold) | Record voice. Hold to speak, release to transcribe |
| **A** | Confirm transcription → Claude Code initializes project |
| **B** | Re-record / go back to Project Select |
| **D-pad ↑/↓** | Scroll transcription preview (if long) |

---

### 5. Main HUD / Level 1 (Category Select)

The core screen. ABXY selects a category, which loads Level 2.

| Button | Action |
|--------|--------|
| **A** | Feature → Level 2 Feature Suggestions |
| **B** | Bug → Level 2 Bug Detection |
| **X** | Tech Debt → Level 2 Tech Debt Suggestions |
| **Y** | Yolo → Yolo Mode (Phase 4) / no-op if not implemented |
| **Menu (≡)** | Enter QA Mode |
| **View (☰)** | Open History / Undo timeline |
| **D-pad** | No action at Level 1 (categories are fixed to ABXY) |
| **RB** | Screenshot capture (Phase 1) → Screenshot Feedback screen |

---

### 6. Level 2: Feature Suggestions

8 LLM-generated features. First 2 on A/B, modifier on X, wildcard on Y.

| Button | Action |
|--------|--------|
| **A** | Select suggestion A (top pick) → Level 3 Plan |
| **B** | Select suggestion B (second pick) → Level 3 Plan |
| **X** | Reroll with modifier lens (hits API, cycles lens) |
| **Y** | Select wildcard (the ridiculous one) → Level 3 Plan |
| **RB** | Reroll all — cycles through cached pairs [2-3], [4-5], [6-7], then fresh API call |
| **LB** | Back to Level 1 |
| **D-pad ↑/↓** | Scroll through additional suggestions beyond A/B (if UI supports list view) |
| **D-pad ←/→** | No action |

---

### 7. Level 2: Bug Detection

8 LLM-generated bugs. First 2 on A/B, voice escape on X, wildcard on Y.

| Button | Action |
|--------|--------|
| **A** | Select bug A (most likely) → Level 3 Plan |
| **B** | Select bug B (second likely) → Level 3 Plan |
| **X** | "I'll describe it" — voice input mode (requires LB+A to activate mic) |
| **Y** | Select wildcard bug (stress test idea) → Level 3 Plan |
| **RB** | Reroll all — same caching logic as Feature |
| **LB** | Back to Level 1 |
| **D-pad ↑/↓** | Scroll through additional bug suggestions |

---

### 8. Level 2: Tech Debt

8 LLM-generated cleanup tasks. First 2 on A/B, cleanup lens on X, wildcard on Y.

| Button | Action |
|--------|--------|
| **A** | Select cleanup A → Level 3 Plan |
| **B** | Select cleanup B → Level 3 Plan |
| **X** | Reroll with cleanup lens (cycles: testable → readable → faster → accessible) |
| **Y** | Select wildcard cleanup (the absurd one) → Level 3 Plan |
| **RB** | Reroll all — same caching logic |
| **LB** | Back to Level 1 |
| **D-pad ↑/↓** | Scroll through additional suggestions |

---

### 9. Level 3: Plan Confirmation

User reviews the AI's implementation plan before shipping.

| Button | Action |
|--------|--------|
| **A** | "Ship it" — approve plan, send `claude_code_intent` to Claude Code → AI Working |
| **B** | "Nah" — reject plan, return to Level 2 (rejected suggestion added to exclusion list) |
| **X** | "Tell me more" — expand plan with substeps, risks, files affected → Level 3 Expanded |
| **Y** | "Ship it but unhinged" — approve plan with `unhinged_modifier` appended → AI Working |
| **D-pad ↑/↓** | Scroll plan steps (if plan is longer than viewport) |
| **LB** | Back to Level 2 (no rejection logged — user just wants to browse more) |

---

### 10. Level 3: Plan Expanded

After pressing X on Level 3. Shows detailed substeps, risks, files.

| Button | Action |
|--------|--------|
| **A** | "Ship it" — approve expanded plan → AI Working |
| **B** | "Nah" — reject, return to Level 2 |
| **X** | Disabled / "that's all I got" (already expanded) |
| **Y** | "Ship it but unhinged" → AI Working |
| **D-pad ↑/↓** | Scroll expanded plan details |
| **LB** | Back to Level 3 (un-expanded view) |

---

### 11. AI Working (Claude Code Executing)

Claude Code is writing code on the left panel. Right panel shows progress.

| Button | Action |
|--------|--------|
| **B** | Interrupt / cancel current task (with confirmation) |
| **R-stick ↕** | Scroll terminal output (left panel) |
| **D-pad ↑/↓** | Scroll progress steps on right panel |
| **RT** | Switch to app being built (to check results while AI works) |
| **RB** | Screenshot capture (if Phase 1 implemented) |
| All other buttons | Disabled (prevent accidental navigation while AI works) |

*Phase 4 only:* If mini-game is implemented, gamepad controls switch to mini-game context when active.

---

### 12. Screenshot Feedback (Phase 1)

Captured a screenshot. Now deciding what to do with it.

| Button | Action |
|--------|--------|
| **A** | Send screenshot to AI context silently (adds to Claude Code's context) |
| **LB + A** (hold) | Voice annotate the screenshot (high-friction, record while held) |
| **B** | Discard screenshot, return to previous screen |
| **Y** | Send screenshot + trigger a new task ("fix what you see") |
| **D-pad** | No action |

---

### 13. QA Mode (Phase 1)

AI-generated test plan. List of features to test with pass/fail.

| Button | Action |
|--------|--------|
| **D-pad ↑/↓** | Navigate feature test list |
| **A** | Run test on selected feature / "Fix this" on a failed feature |
| **B** | Exit QA mode, return to Main HUD (Level 1) |
| **X** | Run quick test (the single most important test) |
| **Y** | "Fix all" — auto-fix all failures (lazy trust mode) |
| **RB** | Re-run all tests (refresh QA report) |
| **R-stick ↕** | Scroll test details / results |

---

### 14. History / Undo (Phase 1)

Git-backed timeline. Every AI action is a commit.

| Button | Action |
|--------|--------|
| **D-pad ↑/↓** | Navigate commit timeline |
| **A** | Preview selected state (show diff / snapshot) |
| **B** | Exit history, return to Main HUD (Level 1) |
| **Y** | Rollback to selected commit → Rollback Confirmation |
| **R-stick ↕** | Scroll diff details in preview |

---

### 15. Rollback Confirmation

Confirming a destructive undo action.

| Button | Action |
|--------|--------|
| **A** | Confirm rollback — revert to selected commit |
| **B** | Cancel — return to History screen |
| **D-pad ↑/↓** | Scroll "what will be undone" details |

---

### 16. Exploration Mode (Phase 2)

Browse project ideas by category. For when you don't know what to build.

| Button | Action |
|--------|--------|
| **D-pad ←/→** | Navigate categories (Games, Tools, Art+Creative, Just For Fun, Surprise Me) |
| **A** | Build selected idea → Voice Pitch (pre-filled) or straight to Claude Code init |
| **B** | Go back to Project Select |
| **X** | "More ideas" — load next page of ideas in this category |
| **Y** | Shuffle — randomize ideas across categories |
| **D-pad ↑/↓** | Navigate between ideas within a category |
| **RB** | Reroll current category ideas (fresh API call) |

---

### 17. Error State (Phase 1)

Something went wrong. Recovery options displayed.

| Button | Action |
|--------|--------|
| **A** | "Let AI fix it" — send error context to Claude Code |
| **B** | Return to Main HUD (Level 1) — ignore the error |
| **X** | Retry last action |
| **Y** | Rollback to last good state (git reset) |
| **D-pad ↑/↓** | Scroll error details |

---

### 18. Settings (Phase 3)

Keybind configuration and preferences.

| Button | Action |
|--------|--------|
| **D-pad ↑/↓** | Navigate settings options |
| **A** | Select / edit setting |
| **B** | Back / exit settings |
| **D-pad ←/→** | Adjust value (for sliders, model selection, etc.) |

---

### 19. Yolo Mode (Phase 4)

AI is running wild with no plan. User surrendered control.

| Button | Action |
|--------|--------|
| **B** | Interrupt / abort Yolo (the only escape) |
| **R-stick ↕** | Scroll terminal output (watch the chaos) |
| All other buttons | Disabled (you chose this) |

---

### 20. Delete Project Confirmation

Confirming project deletion from Project Select.

| Button | Action |
|--------|--------|
| **A** | Confirm delete |
| **B** | Cancel — return to Project Select |

---

### 21. Permission Prompt (Claude Code dangerous operation)

DeckForge intercepts Claude Code's permission requests and shows a gamepad-friendly confirmation.

| Button | Action |
|--------|--------|
| **A** | Approve the operation |
| **B** | Deny the operation |
| **X** | "Tell me more" — show details of what Claude Code wants to do |
| **D-pad ↑/↓** | Scroll operation details |

---

### 22. Deploy Mode (Phase 1)

Push code to remote and trigger deployment. Accessed after QA approval or directly from Main HUD.

| Button | Action |
|--------|--------|
| **A** | Push and Deploy — merge to target branch, push, trigger production deploy |
| **B** | Preview Deploy — push branch to preview URL, no merge (non-destructive) |
| **X** | Push Only — push branch to origin, open PR, no deploy |
| **Y** | Review Changes — view full diff of all commits before deciding |
| **RB** | Change Deploy Target — cycle between configured providers |
| **LB** | Deploy History — view past deployments with status/URLs |
| **D-pad ↑/↓** | Scroll terminal output (commit log, pre-flight checks, deploy status) |
| **R-stick ↕** | Scroll terminal output (left panel) |
| **Menu (≡)** | Back to Main HUD (Level 1) |

---

## COMBO BINDINGS (multi-button)

| Combo | Action | Available On |
|-------|--------|-------------|
| **LB + A** (hold) | Voice input (record while held) | Bug L2 (X slot), Screenshot Feedback, Voice Pitch |
| **LB + D-pad ←/→** | Resize split panels | Global (all screens) |
| **LB + D-pad ↑/↓** | Jump to split presets | Global (all screens) |

---

## BACK GRIP DEFAULTS (configurable in Settings)

| Grip | Default Binding | Equivalent To |
|------|----------------|---------------|
| **L4** | Quick QA | Menu button (enters QA mode) |
| **L5** | Undo | View button (opens History) |
| **R4** | Restart app | Kill + relaunch the app being built |
| **R5** | Commit checkpoint | Manual git commit with auto-message |

Users can rebind these per-project in Settings (Phase 3). Options include: DeckForge actions, shell commands, saved AI prompts.

---

## STICK MAPPING

| Stick | Action | Context |
|-------|--------|---------|
| **L-stick ↕** | Navigate / scroll lists | Project Select, long lists |
| **L-stick ↔** | No default binding | Reserved for future use |
| **R-stick ↕** | Scroll left panel (terminal output) | Global — always scrolls Claude Code output |
| **R-stick ↔** | No default binding | Reserved for future use |
| **L-stick click** | No default binding | Reserved |
| **R-stick click** | No default binding | Reserved |

---

## BUTTON CONFLICT NOTES

1. **RB means different things depending on screen:**
   - Level 2 screens: Reroll suggestions
   - Main HUD / AI Working: Screenshot capture (Phase 1)
   - QA Mode: Re-run tests
   - Deploy Mode: Change deploy target
   - These are non-overlapping contexts, so no actual conflict.

2. **LB is always a modifier key:**
   - LB alone = "Back" on Level 2/3 screens
   - LB + D-pad = resize panels
   - LB + A = voice input
   - Priority: combos checked first, then single-press fallback.

3. **B is always "back/cancel/reject"** — consistent exit across all screens.

4. **A is always "confirm/select/proceed"** — consistent positive action.

5. **RT/LT (window switching) are truly global** — they work even during AI Working, QA, History, etc. The user should always be able to flip to their app and back.

---

## SCREEN FLOW SUMMARY (which screen leads where)

```
Splash → Project Select
              ├── A → Main HUD (Level 1)
              │         ├── A → L2 Feature → L3 Plan → AI Working → QA Mode → Deploy Mode → back to L1
              │         ├── B → L2 Bug     → L3 Plan → AI Working → QA Mode → back to L1
              │         ├── X → L2 Tech    → L3 Plan → AI Working → QA Mode → back to L1
              │         ├── Y → Yolo Mode (Phase 4)
              │         ├── Menu → QA Mode → back to L1
              │         ├── View → History / Undo → back to L1
              │         └── RB → Screenshot Feedback → back to previous
              ├── B → Delete Confirmation → back to Project Select
              ├── X → Exploration Mode → back to Project Select (or build)
              └── Y → Voice Pitch → Claude Code init → Main HUD

Empty State → (same as Project Select but with starter ideas instead of project list)

Note: Deploy Mode is optional in the flow. After QA Mode approves changes,
DeckForge offers to deploy if a deploy provider is configured. If not
configured or user skips, returns to Level 1. Deploy Mode is also
accessible directly from the QA screen's secondary actions.
```
