# Memory

## Me
Mathew (mdeeb95@gmail.com). Building DeckForge solo. Does not write code — feeds prompts into Claude Code and steers. Creative director mindset.

## Project
| Field | Value |
|-------|-------|
| **DeckForge** | Steam Deck gamepad-only interface for Claude Code. Split-panel: terminal left, ABXY action palette right. |
| **Stage** | Active build — executing 24 sequenced prompts. Currently at Prompt 16 (screenshot + voice). |
| **Repo** | ~/Documents/DeckForge (local), pushed to GitHub |
| **Resolution** | 1280x800 fixed (Steam Deck native). No scroll — everything fits in viewport. |

## Terms
| Term | Meaning |
|------|---------|
| L1 / Level 1 | Category Select screen (Feature/Bug/Tech Debt/Yolo) |
| L2 / Level 2 | Suggestion Select — AI-generated options per category |
| L3 / Level 3 | Plan Confirmation — approve/reject/expand before AI codes |
| Action Palette | Right panel with ABXY cards + secondary buttons |
| Prediction Engine | Dual-LLM system: generates suggestions for the right panel |
| Ship It | A button on L3 — approve plan, Claude Code executes |
| Ship It Unhinged | Y button on L3 — approve with extra creative freedom |
| Reroll | RB on L2 — cycle through cached suggestion pairs |
| Screenshot Capture | RB globally (except L2) — captures screen, shows flash, opens feedback |
| Screenshot Feedback | Post-capture screen: send to Claude, discard, voice annotate, or new task |
| Voice Pitch | Voice input screen — Web Speech API transcription with idle/recording/done phases |
| Flash Overlay | 200ms white flash on screenshot capture, mounted globally in App.svelte |
| YOLO | Y button category at L1. Always ridiculous. Design rule. |
| Stitch | External HTML mockup tool. Tends to drift from spec. |
| Back grips | L4/L5/R4/R5 — configurable per project |

## Tech Stack
| Layer | Tech |
|-------|------|
| Shell | Tauri 2 (Rust backend) |
| Frontend | Svelte 5 + TypeScript + Vite 7 |
| Styling | Tailwind CSS 3 (custom config) |
| Fonts | Space Grotesk (display) + JetBrains Mono (mono) |
| Colors | primary #0df2f2, secondary #f20dcf, bg #0d1117, surface #161b22, border #30363d |
| Backend | FastAPI + PostgreSQL + Langfuse |
| AI | Claude Code SDK (subprocess) + Direct API (predictions) |
| Deploy | Railway (backend), Flatpak (Steam Deck app) |

## Build Prompts Progress
| # | What | Status |
|---|------|--------|
| 1-10 | Scaffold, UI, screens, gamepad, data model | Done |
| 11 | Claude Code SDK integration | Done |
| 12 | Prediction engine client (mock) | Done |
| 13 | FastAPI backend | Done |
| 14 | Wire Svelte frontend to FastAPI backend | Done |
| 15 | Window management, app launching, auto-detect | Done |
| 16 | Screenshot capture + voice input | Done |
| 17-24 | QA, deploy, packaging, Pong demo | Pending |

## Design Rules
- No scroll on any screen — 1280x800 is fixed, content must fit
- Color only where it means something — if it glows, user needs to look at it
- Y is ALWAYS something ridiculous (design rule, not suggestion)
- On L1 all 4 buttons get branded colors; on L2+ X/Y fade to neutral slate
- "Vibe coding" is banned terminology. This is deliberate, opinionated.
- Selected card: cyan left accent bar with glow shadow
- Border radius is minimal: 0.125rem default

## Preferences
- Does not write code — prompts only, Claude Code executes
- Wants things to "just work" after each prompt
- Values upfront design docs over iterating in code
- Likes concise status updates, not walls of text
- Fine with things being easy when the spec is tight
- You will often be given tasks in the tasks folder, if you are completing that, move it to done when done
- After completing a task, always suggest 2–3 potential improvements or follow-up items

> Full glossary: memory/glossary.md | Project details: memory/projects/deckforge.md | Tech context: memory/context/tech-stack.md
