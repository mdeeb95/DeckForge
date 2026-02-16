# DeckForge Research Report: Prior Art, Libraries & Tech Stack

## 1. SIMILAR EXISTING PROJECTS

### Claude Code Wrappers (direct precedent)

**CodePilot** — Native desktop GUI for Claude Code (Electron + Next.js). Visual chat, code management, project browsing.
- https://github.com/op7418/CodePilot
- Relevance: Direct precedent for wrapping Claude Code in alternative UI

**Claude Code UI (CloudCLI)** — Free open-source web GUI wrapper for Claude Code, Cursor CLI, and Codex.
- https://github.com/siteboon/claudecodeui
- Relevance: Demonstrates subprocess integration patterns

**Claude Chic** — TUI wrapper for Claude Code using Textual library.
- https://matthewrocklin.com/introducing-claude-chic/
- Relevance: TUI approach adaptable for gamepad navigation; shows theme customization over Agent SDK

**OPCode** — GUI app built with Tauri 2 for Claude Code. Manages agents, sessions, visual workspace.
- https://github.com/winfunc/opcode
- Relevance: Tauri-based (lighter than Electron); GUI best practices for code agent UIs

**Awesome Claude Code** — Curated list of Claude Code wrappers, plugins, agent orchestrators.
- https://github.com/hesreallyhim/awesome-claude-code

### Voice & Non-Traditional Input Coding

**Vibe Coding** — Collins Dictionary Word of the Year 2025. 25% of YC Winter 2025 startups have 95%+ AI-generated code.
- https://cloud.google.com/discover/what-is-vibe-coding

**MobMateWhispTalk** — Steam app using whisper.cpp for offline speech-to-text on Steam Deck.
- https://store.steampowered.com/app/4261090/MobMateWhispTalk/
- Relevance: **Proof that Whisper works on Steam Deck hardware**

---

## 2. OPEN-SOURCE LIBRARIES

### Critical Path (must-have)

**claude-code-sdk-python** — Official Python SDK for running Claude Code programmatically via subprocess.
- https://github.com/anthropics/claude-code-sdk-python
- https://code.claude.com/docs/en/headless
- **This is THE interface layer. JSON output, tool approval callbacks, streaming.**

**whisper.cpp** — C/C++ port of OpenAI Whisper. Runs on CPU, proven on Steam Deck.
- https://github.com/ggerganov/whisper.cpp

**Vosk** — Offline speech recognition, 20+ languages, runs on Raspberry Pi.
- https://github.com/alphacep/vosk-api

### Gamepad Input

**piborg/Gamepad** — Simple Python gamepad input on Linux.
- https://github.com/piborg/Gamepad

**inputs** — Cross-platform Python library for keyboards, mice, gamepads.
- https://pypi.org/project/inputs/

**approxeng.input** — Higher-level gamepad abstractions with Steam Controller support.
- https://approxeng.github.io/approxeng.input/

**AntiMicroX** — Graphical gamepad-to-keyboard mapper (fallback).
- https://github.com/AntiMicroX/antimicrox

### Window Management

**wlrctl** — Wayland replacement for xdotool/wmctrl (modern SteamOS).
- Referenced in Raspberry Pi Forums
- **Best choice for Wayland on Steam Deck**

**xdotool / wmctrl** — X11 automation (fallback for Desktop Mode).

### Screenshot Capture

**pyscreenshot** — Python, multiple backends including Wayland (grim, XDG Portal).
- https://github.com/ponty/pyscreenshot
- **Best choice for Steam Deck (Wayland-compatible)**

**xcap** — Rust library, X11 + Wayland, includes video recording.
- https://github.com/nashaofu/xcap

### UI Framework

**Tauri** — Lightweight desktop framework (web UI + Rust backend). Recommended over Electron.
- https://tauri.app/
- Lower resource usage than Electron, critical for Steam Deck APU

**Qt Gamepad** — Native Qt module for gamepad input (evdev backend).
- https://doc.qt.io/qt-5/qtgamepad-index.html
- KDE-friendly, lower latency than web frameworks

### TUI Options

**Ratatui** — Rust TUI library.
- https://github.com/ratatui/ratatui

**retroterm** — Terminal game launcher with gamepad support (proof of concept).
- https://github.com/monteslu/retroterm

---

## 3. DESIGN REFERENCE

**Yarn Spinner Dialogue Wheels** — Six-segment and auto-layout wheels for narrative games.
- https://docs.yarnspinner.dev/yarn-spinner-for-unity/unity-add-ons/dialogue-wheel

**Game UI Database — Dialogue & Speech** — Curated game dialogue UI patterns.
- https://www.gameuidatabase.com/index.php?scrn=162&set=1&tag=67

**Steam Input API** — Comprehensive controller customization with action sets.
- https://partner.steamgames.com/doc/features/steam_controller

---

## 4. RECOMMENDED TECH STACK

| Layer | Choice | Why |
|-------|--------|-----|
| Claude Code interface | claude-code-sdk-python | Official SDK, JSON streaming, subprocess |
| UI shell | Tauri 2 | Lighter than Electron, Rust backend, web frontend |
| Gamepad input | inputs + evdev | Cross-platform with Linux fallback |
| Speech-to-text | whisper.cpp (tiny/base model) | Proven on Steam Deck, offline, fast |
| Screenshots | pyscreenshot | Wayland + X11 compatible |
| Window management | wlrctl + wmctrl fallback | Wayland-first, X11 fallback |
| Packaging | Flatpak | Steam Deck native distribution |

## 5. KEY INSIGHTS

1. **Multiple teams have already wrapped Claude Code** in alternative UIs — architecture patterns are proven
2. **Voice-on-gamepad for coding is unexplored** — genuine innovation opportunity
3. **MobMateWhispTalk proves** speech-to-text works on Steam Deck hardware
4. **Dialogue wheels from games** are directly transferable to predicted action palettes
5. **claude-code-sdk-python** is the correct interface layer (not screen-scraping the CLI)
6. **Tauri over Electron** for Steam Deck — resource constraints matter
