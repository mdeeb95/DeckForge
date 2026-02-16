# DeckForge

**What:** Steam Deck gamepad-only interface for Claude Code
**Status:** Active build — prompt 13 of 24
**Owner:** Mathew (solo)
**Repo:** ~/Documents/DeckForge → GitHub

## The Idea
A split-screen app where the left panel shows raw Claude Code terminal output and the right panel is an AI-generated action palette navigated with ABXY buttons. The user is the creative director — steering, not driving. Every button press is a creative decision.

## Core Flow
1. **Empty State** → Open or create project
2. **Project Select** → Pick a project
3. **Level 1** → Category: Feature / Bug / Tech Debt / Yolo
4. **Level 2** → AI suggests 4 options (A/B sensible, X modifier, Y ridiculous)
5. **Level 3** → Review plan: Ship It / Reject / Expand / Unhinged
6. **AI Working** → Claude Code executes, terminal streams
7. **QA Mode** → Test results, approve/reject changes
8. **Deploy Mode** → Git push + deploy to production

## Architecture

```
src/
├── App.svelte              (root, gamepad init, debug shortcuts)
├── lib/
│   ├── components/         (7 reusable: ActionCard, ActionPalette, BottomHUD, etc.)
│   ├── screens/            (12 screens: Level1-3, QA, Deploy, etc.)
│   ├── stores/             (app state, terminal, config, prediction)
│   ├── types/              (full TypeScript interfaces from data model)
│   ├── data/               (Tauri FS config read/write + defaults)
│   ├── input/              (gamepad polling, inputRouter, navigation)
│   ├── prediction/         (types, contextAssembler, client, cache)
│   └── claude/             (subprocess, streamParser, claudeMd)
src-tauri/                  (Rust backend: lib.rs, Cargo.toml, tauri.conf.json)
backend/                    (FastAPI: routes, prompts, LLM client, DB, Dockerfile)
docs/                       (11 design docs — requirements, style guide, etc.)
mockups/                    (11 HTML mockups — one per screen)
```

## Build Prompt Sequence
24 prompts, executed sequentially. Each builds on the last.

**Completed (1-12):**
- P1: Tauri + Svelte + Tailwind scaffold
- P2: Base layout shell (StatusBar, TerminalPanel, ActionPalette, BottomHUD)
- P3: ActionCard component with variants
- P4: Svelte stores (app state, terminal)
- P5: Level 1 screen
- P6: Level 2 + Level 3 screens with navigation
- P7: All remaining 9 screens (static)
- P8: Gamepad input system
- P9: Wire gamepad to all screens
- P10: Local data model (Tauri FS persistence)
- P11: Claude Code SDK integration
- P12: Prediction engine client (mock mode)

**In progress:**
- P13: FastAPI backend (routes, DB, LLM client, Langfuse, Dockerfile)

**Remaining (14-24):**
- P14: Wire frontend to backend
- P15: QA mode integration
- P16: Screenshot feedback loop
- P17: Deploy mode integration
- P18: Exploration mode AI
- P19: Voice pitch (speech-to-text)
- P20: Settings + onboarding
- P21: Langfuse observability
- P22: Railway deployment
- P23: Tauri/Flatpak packaging
- P24: Demo project (Local Network Pong)

## Known Issues
- Full-width screens need `overflow-y: auto` or strict viewport fitting (no scroll rule)
- Debug keyboard shortcuts mapped to 0/-/= for screens 10-12 (not intuitive)
- Terminal content duplication was fixed (entries.clear() guard in onMount)

## Key Design Decisions
- Tauri over Electron: lighter, Rust backend, better for Steam Deck
- Svelte over React: simpler reactivity, less boilerplate, AI-codable
- 24-prompt sequential build: each prompt is self-contained, verifiable
- Mock predictions first, real backend later: get UI interactive fast
- Flatpak distribution: installable via Discover on Steam Deck
