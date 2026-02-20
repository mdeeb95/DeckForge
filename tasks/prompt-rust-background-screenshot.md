# Prompt: Rust Background Gamepad Monitor — Screenshot Capture via RB

## Context
DeckForge's screenshot feature (RB) is designed for manual testing: the user switches to their app (RT), tests something, sees a bug, and presses RB to screenshot it and feed it back to Claude Code. **This workflow is currently broken** because gamepad input is polled via `requestAnimationFrame` in the browser, which pauses entirely when the DeckForge webview loses focus.

The screenshot *capture* tools (`grim` on Wayland, `scrot` on X11, `screencapture` on macOS) already grab the full screen — so the capture itself would work correctly. The problem is purely that **the RB press is never detected** while DeckForge is backgrounded.

### Why this matters
This is one of the highest-value features in DeckForge. The whole point of the tool is: build → test → screenshot → feed back to AI → iterate. If the user has to manually switch back to DeckForge before screenshotting, they lose the context of what they were looking at. And if they do switch back first, the screenshot captures DeckForge — which is useless for the workflow.

### Current flow (broken)
1. User presses RT → switches to their app
2. User sees a bug, presses RB
3. **Nothing happens** — `requestAnimationFrame` is paused, RB is never detected
4. User has to press LT to come back, then RB — but now the screenshot captures DeckForge, not their app

### Desired flow
1. User presses RT → switches to their app
2. User sees a bug, presses RB
3. Capture sound plays, screenshot is saved
4. DeckForge automatically comes back to the foreground
5. Screenshot feedback screen shows with the captured image ready to send to Claude

---

## Approach: Rust Owns ALL Screenshot Capture

Move screenshot capture entirely to a Rust background thread using the `gilrs` crate for OS-level gamepad polling. This thread runs independently of the webview's focus state. It **only** listens for RB — all other gamepad input stays in the browser layer (which works fine when focused).

**Key simplification:** Screenshots of DeckForge itself are useless for the workflow, so there's no reason to keep the browser-layer RB handler. Rust handles ALL RB presses — no focus detection, no dual-path, no deduplication logic. One path, always.

Every RB press:
1. Run the screenshot capture command (`grim`/`scrot`/`screencapture`)
2. Save the PNG + metadata sidecar to the project's `.deckforge/screenshots/` directory
3. Play the capture sound via the existing Rust audio thread
4. Emit a Tauri event to the frontend with the screenshot path
5. Focus the DeckForge window (no-op if already focused)

### Why `gilrs`
- Cross-platform: uses evdev on Linux, IOKit on macOS, XInput on Windows
- Event-based on Linux (blocks on evdev read) — near-zero CPU when idle
- Well-maintained, widely used in the Rust gamepad/game ecosystem
- Handles controller hotplug automatically

---

## Section 1: Add Dependencies

### 1.1 Modify `src-tauri/Cargo.toml`

Add to `[dependencies]`:

```toml
gilrs = "0.11"
chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }
```

`gilrs` provides OS-level gamepad input. `chrono` is for timestamp formatting in metadata sidecars.

On Linux, `gilrs` depends on `libudev-dev` — the Steam Deck has this, and the Flatpak build should already include it. On macOS (dev), it uses IOKit (no extra deps).

Run `cargo check` in `src-tauri/` to verify it compiles.

---

## Section 2: Rust Gamepad Monitor Module

### 2.1 Create `src-tauri/src/gamepad.rs`

This module contains:
- Display server detection (needed for platform-specific capture commands)
- Background thread that polls gilrs for RB presses
- Screenshot capture function
- Window focus function

#### Display server detection

```rust
use std::process::Command as StdCommand;
use tauri::{AppHandle, Emitter};

#[derive(Debug)]
enum DisplayServer {
    Wayland,
    X11,
    MacOS,
    Unknown,
}

fn detect_display_server() -> DisplayServer {
    if std::env::var("WAYLAND_DISPLAY").map(|v| !v.is_empty()).unwrap_or(false) {
        return DisplayServer::Wayland;
    }
    if std::env::var("DISPLAY").map(|v| !v.is_empty()).unwrap_or(false) {
        return DisplayServer::X11;
    }
    if cfg!(target_os = "macos") {
        return DisplayServer::MacOS;
    }
    DisplayServer::Unknown
}
```

#### Event payload

```rust
#[derive(Clone, serde::Serialize)]
pub struct ScreenshotCapturedEvent {
    pub path: String,
    pub meta_path: String,
    pub captured_at: String,
}
```

#### Main monitor thread

```rust
use gilrs::{Button, Event, EventType, Gilrs};
use std::sync::{Arc, Mutex};

pub fn spawn_monitor(
    app: AppHandle,
    project_path: Arc<Mutex<String>>,
    audio_sender: std::sync::mpsc::Sender<crate::audio::AudioCommand>,
) {
    std::thread::spawn(move || {
        let mut gilrs = match Gilrs::new() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("[gamepad] Failed to init gilrs: {e} — background screenshot disabled");
                return;
            }
        };

        let display_server = detect_display_server();
        eprintln!("[gamepad] Background monitor started — display server: {display_server:?}");

        // Debounce: prevent rapid-fire screenshots
        let mut last_capture = std::time::Instant::now()
            - std::time::Duration::from_secs(1); // Allow immediate first capture

        loop {
            while let Some(Event { event, .. }) = gilrs.next_event() {
                if let EventType::ButtonPressed(Button::RightTrigger, _) = event {
                    // Debounce — 500ms cooldown between captures
                    if last_capture.elapsed() < std::time::Duration::from_millis(500) {
                        continue;
                    }

                    let proj_path = project_path.lock().unwrap().clone();
                    if proj_path.is_empty() {
                        eprintln!("[gamepad] No project path set, skipping capture");
                        continue;
                    }

                    eprintln!("[gamepad] RB pressed → capturing screenshot");
                    last_capture = std::time::Instant::now();

                    // Play capture sound immediately via the existing audio thread
                    let _ = audio_sender.send(crate::audio::AudioCommand {
                        name: "capture".to_string(),
                        volume: 0.6,
                    });

                    match capture_screenshot(&display_server, &proj_path) {
                        Ok(result) => {
                            let _ = app.emit("screenshot-captured", result);
                            focus_deckforge(&display_server);
                        }
                        Err(e) => {
                            eprintln!("[gamepad] Screenshot capture failed: {e}");
                        }
                    }
                }
            }

            // Small sleep to prevent busy-wait on macOS (evdev on Linux blocks naturally)
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
    });
}
```

#### Screenshot capture function

```rust
fn capture_screenshot(
    display_server: &DisplayServer,
    project_path: &str,
) -> Result<ScreenshotCapturedEvent, String> {
    let now = chrono::Utc::now();
    let ts = now.format("%Y-%m-%dT%H-%M-%S").to_string();
    let filename = format!("{ts}.png");
    let dir = format!("{project_path}/.deckforge/screenshots");
    let output_path = format!("{dir}/{filename}");
    let meta_path = format!("{dir}/{filename}.meta.json");

    // Ensure directory exists
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;

    // Run platform-specific capture
    let status = match display_server {
        DisplayServer::Wayland => StdCommand::new("grim").arg(&output_path).status(),
        DisplayServer::X11 => StdCommand::new("scrot").arg(&output_path).status(),
        DisplayServer::MacOS => StdCommand::new("screencapture").args(["-x", &output_path]).status(),
        DisplayServer::Unknown => return Err("Unknown display server".to_string()),
    }.map_err(|e| format!("capture command failed: {e}"))?;

    if !status.success() {
        return Err(format!("capture exited with code {:?}", status.code()));
    }

    // Write metadata sidecar
    let meta = serde_json::json!({
        "captured_at": now.to_rfc3339(),
        "session_number": 1,
        "source_window": "app",
        "sent_to_claude_code": false,
        "voice_annotation": null,
        "triggered_task": false,
    });
    std::fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap())
        .map_err(|e| format!("meta write failed: {e}"))?;

    Ok(ScreenshotCapturedEvent {
        path: output_path,
        meta_path,
        captured_at: now.to_rfc3339(),
    })
}
```

**Note on `session_number`:** Defaults to 1 in the Rust-written sidecar. The frontend overwrites this with the correct value from its Svelte store when it receives the event. Keeps the Rust side simple.

#### Window focus function

```rust
fn focus_deckforge(display_server: &DisplayServer) {
    let result = match display_server {
        DisplayServer::Wayland => {
            StdCommand::new("wlrctl")
                .args(["toplevel", "focus", "DeckForge"])
                .status()
        }
        DisplayServer::X11 => {
            StdCommand::new("wmctrl")
                .args(["-a", "DeckForge"])
                .status()
        }
        DisplayServer::MacOS => {
            StdCommand::new("osascript")
                .args(["-e", "tell application \"DeckForge\" to activate"])
                .status()
        }
        DisplayServer::Unknown => return,
    };

    if let Err(e) = result {
        eprintln!("[gamepad] Failed to focus DeckForge: {e}");
    }
}
```

---

## Section 3: Expose Audio Sender for Cross-Thread Use

The gamepad thread needs to play the capture sound directly through the existing audio thread. Currently `AudioCommand` is private to `audio.rs`. We need to make it public and expose the sender.

### 3.1 Modify `src-tauri/src/audio.rs`

Make `AudioCommand` public:

```rust
pub struct AudioCommand {
    pub name: String,
    pub volume: f32,
}
```

Make `AudioState` expose a method to clone the sender:

```rust
impl AudioState {
    // ... existing new() ...

    pub fn get_sender(&self) -> Option<std::sync::mpsc::Sender<AudioCommand>> {
        self.sender.clone()
    }
}
```

---

## Section 4: Wire into lib.rs

### 4.1 Modify `src-tauri/src/lib.rs`

Add the module declaration at the top:

```rust
mod gamepad;
```

Add a Tauri command to set the project path from the frontend (called when a project is opened):

```rust
struct ScreenshotProjectPath(Arc<Mutex<String>>);

#[tauri::command]
fn set_screenshot_project_path(path: String, state: State<ScreenshotProjectPath>) {
    let mut p = state.0.lock().unwrap();
    *p = path;
}
```

Update `run()` to create shared state and spawn the monitor:

```rust
use std::sync::Arc;

pub fn run() {
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let audio_state = audio::AudioState::new();
    let audio_sender = audio_state.get_sender();
    let audio_state = std::sync::Mutex::new(audio_state);

    let project_path = Arc::new(Mutex::new(String::new()));
    let project_path_for_monitor = project_path.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SystemState(Mutex::new(sys)))
        .manage(audio_state)
        .manage(ScreenshotProjectPath(project_path))
        .invoke_handler(tauri::generate_handler![
            get_system_stats,
            updater::check_for_update,
            updater::download_update,
            updater::apply_update,
            updater::restart_app,
            audio::play_sound,
            set_screenshot_project_path,
        ])
        .setup(move |app| {
            updater::cleanup_staged_files();

            // Spawn background gamepad monitor for RB → screenshot
            if let Some(sender) = audio_sender {
                gamepad::spawn_monitor(
                    app.handle().clone(),
                    project_path_for_monitor,
                    sender,
                );
            } else {
                eprintln!("[gamepad] No audio sender — monitor started without sound");
                // Still spawn without sound (create a dummy channel)
                let (tx, _rx) = std::sync::mpsc::channel();
                gamepad::spawn_monitor(
                    app.handle().clone(),
                    project_path_for_monitor,
                    tx,
                );
            }

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

## Section 5: Frontend — Remove Browser RB Handler, Add Event Listener

### 5.1 Remove global RB handler from `inputRouter.ts`

Remove the entire `RB` entry from `globalHandlers` in `src/lib/input/inputRouter.ts`. Rust now owns all RB → screenshot behavior. Also remove the `deploy_mode` and `project_select` screen-specific RB handlers if they exist (check each case — `deploy_mode` has `RB: () => activateByButton('RB')` which is for a different purpose and should stay).

**Wait — check each screen's RB usage first:**
- `globalHandlers` RB → screenshot capture. **Remove this.**
- `deploy_mode` RB → `activateByButton('RB')` (a deploy action, not screenshot). **Keep this.**
- `project_select` RB → `activateByButton('RB')` (browse for project). **Keep this.**

Only remove the global RB handler. Screen-specific RB handlers are for non-screenshot actions and must stay. Since screen handlers run before global handlers, those screens never hit the global RB anyway.

The `screenshotFlash`, `lastScreenshotPath`, and `lastScreenshotMeta` imports in `inputRouter.ts` can be removed if they're only used by the global RB handler. Check before removing.

### 5.2 Add Tauri event listener in App.svelte

In `App.svelte` (or wherever the app initializes), add a listener for the `screenshot-captured` event:

```typescript
import { listen } from '@tauri-apps/api/event';
import { get } from 'svelte/store';
import { lastScreenshotPath, lastScreenshotMeta, screenshotFlash } from './lib/stores/screenshot';
import { navigate } from './lib/stores/app';
import { playCapture } from './lib/audio/sfx';

// In onMount:
listen<{ path: string; meta_path: string; captured_at: string }>(
  'screenshot-captured',
  (event) => {
    const { path, captured_at } = event.payload;

    lastScreenshotPath.set(path);
    lastScreenshotMeta.set({
      captured_at,
      session_number: 1, // Rust defaults this; frontend can update if needed
      source_window: 'app',
      sent_to_claude_code: false,
      voice_annotation: null,
      triggered_task: false,
    });

    // Flash overlay
    screenshotFlash.set(true);

    // Navigate to feedback screen
    navigate('screenshot_feedback');
  }
);
```

Note: The capture sound is already played by the Rust thread directly through the audio channel, so we don't call `playCapture()` here — that would double-fire the sound.

### 5.3 Call `set_screenshot_project_path` when a project is opened

Find where the project path gets set in the frontend. Search for where `projectConfig` or `project.path` is loaded/set — likely in the project select flow or a config store. Add the invoke there:

```typescript
import { invoke } from '@tauri-apps/api/core';

// When project is opened/loaded:
invoke('set_screenshot_project_path', { path: projectConfig.project.path }).catch(() => {});
```

This syncs the current project path to the Rust gamepad thread so it knows where to save screenshots.

### 5.4 Remove `screenshot.ts` system module

The entire `src/lib/system/screenshot.ts` file is now dead code — all screenshot capture logic lives in Rust. Delete this file.

Remove any imports of `captureScreenshot` from other files (should only be `inputRouter.ts` which we already cleaned up in 5.1).

### 5.5 Clean up unused imports in `inputRouter.ts`

After removing the global RB handler, these imports may become unused:
- `screenshotFlash` from `'../stores/screenshot'`
- `lastScreenshotPath` from `'../stores/screenshot'`
- `lastScreenshotMeta` from `'../stores/screenshot'`
- `playCapture` from `'../audio/sfx'`
- `devError` from `'../utils/devLog'` (if only used in the RB handler's catch block)

Check each one and remove if no longer referenced.

---

## Section 6: Edge Cases

### 6.1 No gamepad connected
If no gamepad is connected, `gilrs` initializes fine but produces no events. The thread idles harmlessly. When a controller is plugged in, gilrs picks it up automatically.

### 6.2 Steam Deck button mapping
On the Steam Deck, the standard gamepad mode maps RB to `gilrs::Button::RightTrigger`. `gilrs` reads the underlying evdev events, which reflect the physical buttons — Steam Input remapping happens at a higher layer and won't affect gilrs on Linux. **This means RB in gilrs = physical RB on the controller**, which is what we want.

**Important:** Test that `gilrs::Button::RightTrigger` matches RB on the Steam Deck specifically. If it doesn't, it might be `Button::Unknown` with a raw code — in that case, also match on the raw event code for the Steam Deck controller (Button index 5 in HID terms). Add a fallback check.

### 6.3 macOS development
On macOS, `gilrs` uses IOKit for gamepad access. It works with Xbox/PS controllers connected via Bluetooth or USB. If no controller is connected during dev, the thread just idles — no errors, no crashes.

### 6.4 Thread cleanup
The thread runs for the lifetime of the app — no explicit cleanup needed. When the Tauri app exits, the thread is killed with the process.

### 6.5 No project opened yet
If RB is pressed before any project is opened, `project_path` is empty and the capture is skipped with a log message. No crash, no error.

---

## Section 7: Verify

### 7.1 Cargo check
```bash
cd src-tauri && cargo check
```

Should compile with no errors.

### 7.2 Frontend checks
```bash
npm run check
npx vitest run
```

`npm run check` should pass with 0 errors. Tests should pass — the inputRouter tests may need updating if they tested the global RB handler.

### 7.3 Manual test — background screenshot (the main feature)
1. Open DeckForge, open a project
2. Press RT to switch to the user's app
3. Press RB while in the user's app
4. Verify: capture sound plays, DeckForge pops back to foreground, screenshot feedback screen shows
5. Verify: the screenshot image is of the user's app (not DeckForge)

### 7.4 Manual test — RB while in DeckForge
1. Open DeckForge, stay in DeckForge
2. Press RB
3. Verify: captures whatever is on screen (DeckForge), goes to feedback screen
4. This is harmless — user can just discard. The important thing is it doesn't crash or double-fire.

### 7.5 Manual test — no controller
1. Disconnect all controllers
2. Launch DeckForge
3. Verify: app starts normally, no errors in console related to gamepad monitor

### 7.6 Manual test — rapid RB presses
1. Press RB multiple times quickly
2. Verify: only one screenshot is taken per 500ms (debounce working)

---

## Done State

After this prompt completes:
- `src-tauri/src/gamepad.rs` exists with background monitor, screenshot capture, and window focusing
- `src-tauri/Cargo.toml` includes `gilrs` and `chrono` dependencies
- `src-tauri/src/audio.rs` exposes `AudioCommand` and sender publicly
- `src-tauri/src/lib.rs` registers the gamepad module, spawns the monitor in `.setup()`, exposes `set_screenshot_project_path` command
- Frontend listens for `screenshot-captured` Tauri events in `App.svelte`
- Frontend calls `set_screenshot_project_path` when a project is opened
- Global RB handler removed from `inputRouter.ts` (screen-specific RB handlers for deploy/project_select untouched)
- `src/lib/system/screenshot.ts` deleted (all capture logic now in Rust)
- Unused screenshot-related imports cleaned up from `inputRouter.ts`
- `cargo check` passes
- `npm run check` passes
- `npx vitest run` passes (update tests if needed)
