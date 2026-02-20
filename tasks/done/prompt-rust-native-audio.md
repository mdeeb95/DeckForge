# Prompt: Rust-Native Audio via rodio — Replace HTMLAudioElement

## Context
DeckForge uses 11 short MP3 sound effects for UI feedback (nav ticks, button clicks, success chimes, etc.). Currently these play through `HTMLAudioElement` in the Svelte frontend, which routes through WebKitGTK's GStreamer pipeline on Linux. **This crashes on SteamOS** because the Steam Deck ships without the `autoaudiosink` GStreamer plugin, causing a white screen on app launch.

The fix: move all audio playback to Rust via the `rodio` crate, which talks directly to ALSA/PipeWire — no GStreamer dependency at all. The 11 MP3 files (97KB total) get embedded into the Rust binary with `include_bytes!()`. The frontend calls a single Tauri command `play_sound` instead of using HTMLAudioElement.

Haptics stay in the frontend unchanged — the Gamepad Haptic Actuator API works fine and has nothing to do with GStreamer.

**Important**: `bundleMediaFramework` in `tauri.conf.json` stays `false`. We are intentionally bypassing GStreamer, not bundling it.

---

## Section 1: Add rodio Dependency

### 1.1 Modify `src-tauri/Cargo.toml`

Add to `[dependencies]` (after the existing `tokio` line):

```toml
rodio = { version = "0.20", default-features = false, features = ["mp3"] }
```

We disable default features and only enable `mp3` — this pulls in the `symphonia` MP3 decoder without unnecessary codec bloat. rodio handles output device selection automatically (PipeWire > PulseAudio > ALSA).

Run `cargo check` in `src-tauri/` to verify it compiles.

---

## Section 2: Rust Audio Module

### 2.1 Create `src-tauri/src/audio.rs`

This module embeds all 11 MP3 files and exposes a `play_sound` Tauri command.

```rust
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::io::Cursor;
use std::sync::Mutex;
use tauri::State;

// ── Embed MP3 files at compile time (~97KB total) ────────────────────
static NAV: &[u8] = include_bytes!("../../src/assets/sfx/nav.mp3");
static CLICK: &[u8] = include_bytes!("../../src/assets/sfx/click.mp3");
static SUCCESS: &[u8] = include_bytes!("../../src/assets/sfx/success.mp3");
static ERROR: &[u8] = include_bytes!("../../src/assets/sfx/error.mp3");
static BACK: &[u8] = include_bytes!("../../src/assets/sfx/back.mp3");
static CAPTURE: &[u8] = include_bytes!("../../src/assets/sfx/capture.mp3");
static TOGGLE: &[u8] = include_bytes!("../../src/assets/sfx/toggle.mp3");
static MENU_OPEN: &[u8] = include_bytes!("../../src/assets/sfx/menu-open.mp3");
static MENU_CLOSE: &[u8] = include_bytes!("../../src/assets/sfx/menu-close.mp3");
static REROLL: &[u8] = include_bytes!("../../src/assets/sfx/reroll.mp3");
static SHIP_IT: &[u8] = include_bytes!("../../src/assets/sfx/ship-it.mp3");

// ── Audio state — holds the output stream for its lifetime ───────────
pub struct AudioState {
    _stream: Option<OutputStream>,
    handle: Option<OutputStreamHandle>,
}

impl AudioState {
    pub fn new() -> Self {
        match OutputStream::try_default() {
            Ok((stream, handle)) => AudioState {
                _stream: Some(stream),
                handle: Some(handle),
            },
            Err(e) => {
                eprintln!("Audio output unavailable: {e} — sound effects disabled");
                AudioState {
                    _stream: None,
                    handle: None,
                }
            }
        }
    }
}

fn get_sound_data(name: &str) -> Option<&'static [u8]> {
    match name {
        "nav" => Some(NAV),
        "click" => Some(CLICK),
        "success" => Some(SUCCESS),
        "error" => Some(ERROR),
        "back" => Some(BACK),
        "capture" => Some(CAPTURE),
        "toggle" => Some(TOGGLE),
        "menuOpen" => Some(MENU_OPEN),
        "menuClose" => Some(MENU_CLOSE),
        "reroll" => Some(REROLL),
        "shipIt" => Some(SHIP_IT),
        _ => None,
    }
}

#[tauri::command]
pub fn play_sound(name: String, volume: f32, state: State<Mutex<AudioState>>) {
    let audio = state.lock().unwrap();
    let handle = match &audio.handle {
        Some(h) => h,
        None => return, // No audio backend — silent no-op
    };

    let data = match get_sound_data(&name) {
        Some(d) => d,
        None => return,
    };

    // Spawn a sink for this sound — rodio handles concurrent playback natively.
    // Each sink is fire-and-forget: it plays the sound and drops itself when done.
    // This means rapid re-triggers (D-pad nav) won't cut off previous sounds.
    match Sink::try_new(handle) {
        Ok(sink) => {
            let cursor = Cursor::new(data);
            match Decoder::new(cursor) {
                Ok(source) => {
                    sink.set_volume(volume);
                    sink.append(source);
                    sink.detach(); // Fire-and-forget — plays to completion, then drops
                }
                Err(e) => eprintln!("Failed to decode sound '{name}': {e}"),
            }
        }
        Err(e) => eprintln!("Failed to create audio sink: {e}"),
    }
}
```

Key design decisions:
- `OutputStream` is created once at app startup and held in managed state. rodio requires the stream to live for the entire playback duration — dropping it kills all audio.
- `Sink::detach()` makes playback fire-and-forget. The sink plays to completion then self-cleans.
- Each `play_sound` call creates a new sink, so rapid D-pad navigation won't cut off previous nav sounds (same behavior as the old HTMLAudioElement pool).
- `Mutex<AudioState>` wrapping is needed because `OutputStream` isn't `Send+Sync`. The lock is held only briefly to get the handle reference.
- Volume is a `f32` from 0.0–1.0, matching the existing `sfx.ts` API exactly.
- If audio init fails (no sound device), every call is a silent no-op — no crashes.

---

## Section 3: Register the Module and Command

### 3.1 Modify `src-tauri/src/lib.rs`

Add the module declaration at the top (alongside existing `mod updater`):

```rust
mod audio;
```

Add the audio state initialization in `run()`, right after the `SystemState` setup (before `.invoke_handler`):

```rust
let audio_state = std::sync::Mutex::new(audio::AudioState::new());
```

Add it as managed state:

```rust
.manage(audio_state)
```

Add the command to the invoke handler:

```rust
.invoke_handler(tauri::generate_handler![
    get_system_stats,
    updater::check_for_update,
    updater::download_update,
    updater::apply_update,
    updater::restart_app,
    audio::play_sound,
])
```

The full `run()` function should look like:

```rust
pub fn run() {
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let audio_state = std::sync::Mutex::new(audio::AudioState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SystemState(Mutex::new(sys)))
        .manage(audio_state)
        .invoke_handler(tauri::generate_handler![
            get_system_stats,
            updater::check_for_update,
            updater::download_update,
            updater::apply_update,
            updater::restart_app,
            audio::play_sound,
        ])
        .setup(|app| {
            updater::cleanup_staged_files();
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## Section 4: Rewrite Frontend sfx.ts

### 4.1 Rewrite `src/lib/audio/sfx.ts`

Replace the entire file. The public API stays identical — every `playXxx()` function has the same name and signature. Only the internals change from HTMLAudioElement to Tauri invoke.

```typescript
// ─── Sound Effects — Rust-native via rodio ─────────────────────────
// Audio plays through Tauri's Rust backend (rodio → PipeWire/ALSA).
// No GStreamer dependency. Fire-and-forget — Rust handles concurrency.

import { invoke } from '@tauri-apps/api/core';

// Haptics stay in the frontend — Gamepad Vibration API is unrelated to GStreamer.
import { hapticNav, hapticClick, hapticSuccess, hapticError, hapticBack,
         hapticCapture, hapticToggle, hapticReroll, hapticMenu } from './haptics';

function play(name: string, volume: number): void {
  invoke('play_sound', { name, volume }).catch(() => {});
}

export function playNav(): void     { play('nav', 0.4);     hapticNav(); }
export function playClick(): void   { play('click', 0.6);   hapticClick(); }
export function playSuccess(): void { play('success', 0.8); hapticSuccess(); }
export function playError(): void   { play('error', 0.5);   hapticError(); }
export function playBack(): void    { play('back', 0.5);    hapticBack(); }
export function playCapture(): void { play('capture', 0.6); hapticCapture(); }
export function playToggle(): void  { play('toggle', 0.4);  hapticToggle(); }
export function playMenuOpen(): void  { play('menuOpen', 0.5);  hapticMenu(); }
export function playMenuClose(): void { play('menuClose', 0.4); hapticMenu(); }
export function playReroll(): void  { play('reroll', 0.6);  hapticReroll(); }
export function playShipIt(): void  { play('shipIt', 0.8); }
```

This is dramatically simpler than the old version — no audio pools, no lazy init, no availability checks. All that complexity now lives in Rust where it belongs.

### 4.2 Remove MP3 imports

The old `sfx.ts` imported 11 MP3 files via Vite static asset imports. These are no longer needed because the files are embedded in the Rust binary via `include_bytes!()`. The Vite imports are gone from the rewritten file above.

**Do NOT delete the MP3 files from `src/assets/sfx/`** — they're still needed as the source for `include_bytes!()` in the Rust build. They just won't be bundled into the frontend anymore.

---

## Section 5: Verify

### 5.1 Cargo check

```bash
cd src-tauri && cargo check
```

Should compile with no errors. Warnings about unused imports are fine.

### 5.2 Frontend build

```bash
npm run build
```

Should succeed. The frontend bundle will be smaller now (no MP3 assets in the Vite output).

### 5.3 Confirm no GStreamer references

```bash
grep -r "GStreamer\|gstreamer\|autoaudiosink\|HTMLAudioElement\|new Audio" src/
```

Should return zero results. All audio is now Rust-native.

### 5.4 Dev test

```bash
npm run tauri dev
```

Navigate through screens — you should hear nav ticks, click sounds, and success chimes playing through rodio. On systems without any audio device at all, the app should launch silently without crashing.

---

## Done State

After this prompt completes:
- `src-tauri/src/audio.rs` exists with `play_sound` Tauri command
- `src-tauri/Cargo.toml` includes `rodio` with `mp3` feature
- `src-tauri/src/lib.rs` registers the audio module, state, and command
- `src/lib/audio/sfx.ts` is rewritten to use `invoke('play_sound', ...)` instead of HTMLAudioElement
- No Vite MP3 imports remain in the frontend code
- `src/lib/audio/haptics.ts` is completely untouched
- `cargo check` passes
- `npm run build` passes
- App launches and plays audio on both desktop Linux and Steam Deck without GStreamer
