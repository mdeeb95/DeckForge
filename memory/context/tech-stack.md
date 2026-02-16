# Tech Stack & Environment

## Frontend
| Tech | Version | Purpose |
|------|---------|---------|
| Svelte | 5.45+ | UI framework (runes reactivity) |
| TypeScript | 5.9 | Type safety |
| Vite | 7.3 | Build tool + HMR dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| PostCSS + Autoprefixer | latest | CSS processing |

## App Shell
| Tech | Version | Purpose |
|------|---------|---------|
| Tauri | 2.10 | Desktop app framework (Rust backend) |
| @tauri-apps/api | 2.x | JS API for Tauri features |
| @tauri-apps/plugin-fs | 2.4+ | File system access |
| @tauri-apps/plugin-opener | 2.x | Open external apps |

## Backend
| Tech | Purpose |
|------|---------|
| FastAPI | Python API server |
| PostgreSQL | Database |
| SQLAlchemy + Alembic | ORM + migrations |
| Langfuse | LLM observability/tracing |
| Railway | Deployment platform |

## AI Integration
| Tech | Purpose |
|------|---------|
| @anthropic-ai/claude-code | Claude Code subprocess SDK |
| Anthropic API | Direct API for predictions (fast tier: Haiku, mid tier: Sonnet) |
| OpenAI API | Alternative prediction provider |
| Google Gemini API | Alternative prediction provider |

## Custom Tailwind Config
```
Colors:
  primary: #0df2f2 (cyan)
  primary-dim: #089090
  secondary: #f20dcf (pink/magenta)
  background-dark: #0d1117
  surface-dark: #161b22
  surface-border: #30363d

Fonts:
  display: Space Grotesk (300-700)
  mono: JetBrains Mono (400, 500, 700)

Border Radius:
  DEFAULT: 0.125rem (minimal/sharp)
  lg: 0.25rem
  xl: 0.5rem
  full: 9999px (pills/badges)

Dark Mode: class strategy
```

## Development Environment
- Dev server: `npm run tauri dev` (localhost:1420)
- Window: 1280x800, frameless, non-resizable
- Debug shortcuts: number keys switch screens
- Keyboard fallback: Arrow=D-pad, Enter=A, Escape=B, Q=X, E=Y, Tab=RB, Shift=LB
- isTauri() guard: app works in browser without Tauri APIs (uses defaults)

## File Locations
| What | Where |
|------|-------|
| Global config | ~/.config/deckforge/global.json |
| Project config | <project>/.deckforge/project.json |
| Behavior data | <project>/.deckforge/behavior.json |
| Prediction cache | <project>/.deckforge/cache/ |
| Screenshots | <project>/.deckforge/screenshots/ |
| Claude.md | <project>/.claude/CLAUDE.md (auto-generated) |

## Packaging & Distribution
| Target | Method |
|--------|--------|
| Steam Deck | Flatpak → Discover store |
| Desktop | Tauri native bundles (deb, AppImage, dmg) |
| Backend | Docker → Railway |
