# Glossary

DeckForge internal language, acronyms, and shorthand.

## Screens
| Term | Meaning |
|------|---------|
| L1 / Level 1 | Category Select — Feature/Bug/Tech Debt/Yolo |
| L2 / Level 2 | Suggestion Select — AI picks, rerollable |
| L3 / Level 3 | Plan Confirmation — Ship It / Reject / Expand / Unhinged |
| AI Working | Claude Code executing, terminal streaming, progress tracker |
| QA Mode | Test runner, diff viewer, approve/reject changes |
| Deploy Mode | Git push + deploy to Vercel/Railway/Netlify |
| History | Git log timeline, rollback capability |
| Exploration | Browse project ideas by category |
| Voice Pitch | Voice-to-text project creation |
| Empty State | No projects — first-run experience |
| Project Select | Project list picker |
| Error Screen | Red-tinted, retry/undo/ignore options |

## UI Concepts
| Term | Meaning |
|------|---------|
| Action Palette | Right panel — ABXY cards + secondary buttons |
| Action Card | Single selectable card with button badge (A/B/X/Y) |
| Secondary Card | Dashed-border card for LB/RB actions |
| Terminal Panel | Left panel — Claude Code output stream |
| Bottom HUD | Glass-panel control hints at screen bottom |
| Status Bar | Top bar — project name, connection, RAM/CPU, version |
| Split Panel | Two-panel layout (terminal + palette) |
| Full Width | Single-panel layout (no terminal) |
| Split Ratio | Left/right width ratio, adjustable via LB + D-pad |
| Glass Panel | Semi-transparent panel with backdrop blur |
| Scanline Overlay | CRT-style horizontal line effect for flavor |

## Gamepad
| Term | Meaning |
|------|---------|
| ABXY | Face buttons — primary interaction |
| D-pad | Directional pad — navigate card selection |
| LB / RB | Left/Right bumper — secondary actions, combos |
| LT / RT | Left/Right trigger — window switching |
| Back grips | L4/L5/R4/R5 — configurable shortcuts |
| R-stick | Right analog stick — scroll terminal |
| LB combo | Hold LB + other button for modifier actions |
| Reroll | RB press — cycles through cached suggestion pairs |
| Edge detection | Fires on button press, not hold — one event per press |

## Prediction Engine
| Term | Meaning |
|------|---------|
| Prediction Engine | Dual-LLM system generating right-panel suggestions |
| Context Payload | JSON blob sent to backend: file tree, git, features, behavior |
| Pair cycling | 8 suggestions shown as pairs [0-1] [2-3] [4-5] [6-7], RB advances |
| Hash invalidation | Cache invalidated when detected_features + file_tree + rejections change |
| Wild Card | Y button suggestion — always ridiculous, italic quip |
| Modifier | X button suggestion — contextual tweak |
| Header Quip | One-liner personality text above suggestions |
| Mock mode | Local fake predictions for dev (no backend needed) |
| Remote mode | Real API calls to FastAPI backend |

## Architecture
| Term | Meaning |
|------|---------|
| Tauri 2 | Rust-based app shell (replaces Electron) |
| Svelte 5 | Frontend framework with runes reactivity |
| ScreenRouter | Component that conditionally renders active screen |
| inputRouter | Maps gamepad buttons to screen-specific handlers |
| configStores | Svelte stores wrapping Tauri FS config persistence |
| isTauri() | Guard check — returns false in browser dev mode |
| Claude Code SDK | @anthropic-ai/claude-code — subprocess spawning |
| Langfuse | Observability/tracing for LLM calls |

## Data Files
| File | Location | Purpose |
|------|----------|---------|
| global.json | ~/.config/deckforge/ | App-wide settings |
| project.json | <project>/.deckforge/ | Per-project config |
| behavior.json | <project>/.deckforge/ | User behavior tracking |
| cache/ | <project>/.deckforge/cache/ | Prediction cache per category |

## Build Process
| Term | Meaning |
|------|---------|
| Build prompts | 24 sequenced prompts fed into Claude Code one at a time |
| Dependency map | Graph showing which prompts depend on which |
| Debug shortcuts | Number keys 1-9, 0, -, = to switch screens in dev |
| HMR | Hot Module Replacement — Vite auto-reloads on save |

## Design Rules
| Rule | Detail |
|------|--------|
| No scroll | 1280x800 fixed viewport, everything fits |
| Color = meaning | If it glows, user should look at it |
| Y = ridiculous | Always. Design rule, not suggestion. |
| L1 branded | All 4 buttons get color at L1 |
| L2+ neutral X/Y | X and Y badges fade to slate on L2+ |
| No "vibe coding" | Banned term. This is deliberate, opinionated. |
| Minimal radius | 0.125rem default border-radius |
