# Task: Real Terminal — Rust PTY Backend + xterm.js Frontend

## Goal

Replace the current DOM-rendered Claude Code stream (parsed JSON → styled divs) with a **real embedded terminal** powered by a Rust PTY and xterm.js. When the user sees Claude Code running, it should be indistinguishable from running `claude` in a normal terminal — same animations, spinners, colors, cursor behavior, everything. The ONLY visual change: Anthropic's orange accent becomes DeckForge's cyan (`#0df2f2`).

## Why

The current approach pipes `--output-format stream-json` through a parser into custom-styled HTML. This:
- Loses all of Claude Code's native terminal UI (spinners, progress bars, cursor movement)
- Creates a maintenance burden (every CC update could break the parser)
- Looks like "our UI pretending to be Claude Code" instead of the real thing

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Rust (src-tauri/src/lib.rs)                            │
│  portable-pty spawns a bash shell in a real PTY         │
│  pty_spawn / pty_write / pty_resize / pty_kill commands │
│  PTY stdout → Tauri event "pty-output" (string)         │
│  Frontend input → pty_write command (string)            │
└───────────────────────┬─────────────────────────────────┘
                        │ Tauri events
┌───────────────────────▼─────────────────────────────────┐
│  Svelte (TerminalEmulator.svelte)                       │
│  xterm.js Terminal instance with custom DeckForge theme │
│  Listens to "pty-output" → terminal.write(data)         │
│  terminal.onData → invoke("pty_write", data)            │
│  terminal.onResize → invoke("pty_resize", cols, rows)   │
│  FitAddon auto-sizes to container                       │
└─────────────────────────────────────────────────────────┘
```

## Changes Required

### 1. Rust Dependencies — `src-tauri/Cargo.toml`

Add these dependencies:

```toml
portable-pty = "0.9"
```

No other crates needed. `portable-pty` handles cross-platform PTY creation (Linux + macOS).

### 2. Rust PTY Backend — `src-tauri/src/lib.rs`

This is the biggest change. Add a PTY manager alongside the existing `SystemState`.

**Add these imports at the top:**
```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};
```

**Add PTY state struct:**
```rust
struct PtyState {
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    master: Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>,
}
```

**Add Tauri commands:**

```rust
#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    state: State<PtyState>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    // Kill any existing PTY first
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    let _ = state.writer.lock().unwrap().take();
    let _ = state.master.lock().unwrap().take();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Build shell command
    let mut cmd = CommandBuilder::new("bash");
    cmd.arg("--login");
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    // Clean environment to prevent Claude Code nesting detection
    cmd.env_remove("CLAUDECODE");
    cmd.env_remove("CLAUDE_CODE");

    let child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Get writer for stdin
    let writer = pair.master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    // Get reader for stdout and spawn a thread to forward output
    let mut reader = pair.master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    // Spawn reader thread — forwards PTY output to frontend via Tauri events
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // PTY closed
                Ok(n) => {
                    // Send as string directly — terminal output is UTF-8 + ANSI escapes.
                    // lossy handles any rare non-UTF-8 bytes gracefully.
                    let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app_handle.emit("pty-output", text);
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("pty-exit", ());
    });

    *state.writer.lock().unwrap() = Some(writer);
    *state.master.lock().unwrap() = Some(pair.master);
    *state.child.lock().unwrap() = Some(child);

    Ok(())
}

#[tauri::command]
fn pty_write(state: State<PtyState>, data: String) -> Result<(), String> {
    if let Some(ref mut writer) = *state.writer.lock().unwrap() {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("PTY write failed: {}", e))?;
        writer.flush().map_err(|e| format!("PTY flush failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn pty_resize(state: State<PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(ref master) = *state.master.lock().unwrap() {
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("PTY resize failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn pty_kill(state: State<PtyState>) -> Result<(), String> {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        child.kill().map_err(|e| format!("PTY kill failed: {}", e))?;
    }
    let _ = state.writer.lock().unwrap().take();
    let _ = state.master.lock().unwrap().take();
    Ok(())
}

```

**Register everything in the `run()` function:**

Add to the builder chain (alongside existing `.manage(SystemState(...))` and `.invoke_handler(...)`):

```rust
.manage(PtyState {
    writer: Mutex::new(None),
    master: Mutex::new(None),
    child: Mutex::new(None),
})
.invoke_handler(tauri::generate_handler![
    get_system_stats,
    pty_spawn,
    pty_write,
    pty_resize,
    pty_kill,
])
```

### 3. NPM Dependencies — `package.json`

Add to `dependencies`:

```json
"@xterm/xterm": "^5.5.0",
"@xterm/addon-fit": "^0.10.0",
"@xterm/addon-web-links": "^0.11.0"
```

### 4. Terminal Emulator Component — `src/lib/components/TerminalEmulator.svelte`

Create this new file. This is the xterm.js wrapper that connects to the Rust PTY.

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import type { UnlistenFn } from '@tauri-apps/api/event';

  // Props
  interface Props {
    cwd?: string;
    onExit?: () => void;
  }
  let { cwd, onExit }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let terminal: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let unlistenOutput: UnlistenFn | null = null;
  let unlistenExit: UnlistenFn | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // DeckForge terminal theme — matches the app palette
  // Only accent change: Anthropic orange → DeckForge cyan #0df2f2
  const deckforgeTheme = {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#0df2f2',
    cursorAccent: '#0d1117',
    selectionBackground: '#0df2f233',
    selectionForeground: '#e6edf3',
    // Standard ANSI colors
    black: '#0d1117',
    red: '#f85149',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#f20dcf',       // DeckForge secondary
    cyan: '#0df2f2',          // DeckForge primary (replaces orange)
    white: '#e6edf3',
    // Bright variants
    brightBlack: '#484f58',
    brightRed: '#f85149',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#f778ce',
    brightCyan: '#39d9d9',
    brightWhite: '#ffffff',
  };

  onMount(async () => {
    if (!containerEl) return;

    // Create xterm.js instance
    terminal = new Terminal({
      theme: deckforgeTheme,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: true,
      scrollback: 5000,
      convertEol: true,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Mount into DOM
    terminal.open(containerEl);
    fitAddon.fit();

    // Listen for PTY output from Rust (arrives as plain string, not base64)
    unlistenOutput = await listen<string>('pty-output', (event) => {
      if (!terminal) return;
      terminal.write(event.payload);
    });

    // Listen for PTY exit
    unlistenExit = await listen('pty-exit', () => {
      terminal?.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
      onExit?.();
    });

    // Forward user input to Rust PTY
    terminal.onData((data: string) => {
      invoke('pty_write', { data }).catch(console.error);
    });

    // Sync terminal size with PTY on resize
    terminal.onResize(({ cols, rows }) => {
      invoke('pty_resize', { cols, rows }).catch(console.error);
    });

    // Watch container size changes and refit
    resizeObserver = new ResizeObserver(() => {
      if (fitAddon) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(containerEl);

    // Spawn the PTY with initial dimensions
    const dims = fitAddon.proposeDimensions();
    await invoke('pty_spawn', {
      cols: dims?.cols ?? 80,
      rows: dims?.rows ?? 24,
      cwd: cwd ?? null,
    });
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    unlistenOutput?.();
    unlistenExit?.();
    terminal?.dispose();
    // Don't kill PTY on destroy — it persists across tab switches
  });

  // Public method: write a command into the terminal
  export function writeCommand(command: string) {
    invoke('pty_write', { data: command + '\n' }).catch(console.error);
  }

  // Public method: kill the PTY
  export function kill() {
    invoke('pty_kill').catch(console.error);
  }

  // Public method: refit terminal (call after visibility changes)
  export function refit() {
    fitAddon?.fit();
  }
</script>

<div
  bind:this={containerEl}
  class="w-full h-full terminal-container"
></div>

<style>
  .terminal-container :global(.xterm) {
    padding: 8px;
    height: 100%;
  }
  .terminal-container :global(.xterm-viewport) {
    /* Match DeckForge scrollbar styling */
    scrollbar-width: thin;
    scrollbar-color: #30363d #0d1117;
  }
  .terminal-container :global(.xterm-viewport::-webkit-scrollbar) {
    width: 6px;
  }
  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: #30363d;
    border-radius: 3px;
  }
  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: #0d1117;
  }
</style>
```

### 5. Import xterm.js CSS

In `src/app.css` or wherever global styles are imported, add:

```css
@import '@xterm/xterm/css/xterm.css';
```

If using Vite, this can also go in `src/main.ts` or the root Svelte component:

```typescript
import '@xterm/xterm/css/xterm.css';
```

### 6. Tauri Capabilities — No Changes Needed

The PTY commands are internal Tauri commands (invoke), not shell spawns. They don't need `shell:allow-spawn` entries. The existing capability file is fine.

## What NOT to Change

- **Do NOT modify `subprocess.ts`** — it stays as-is for now. Prompt 2 will handle the integration.
- **Do NOT modify `TerminalPanel.svelte`** yet — that's also Prompt 2.
- **Do NOT remove any existing code** — this prompt is purely additive.

## How to Verify

After building:

1. `cargo build` in `src-tauri/` should succeed with `portable-pty` linking correctly
2. `npm install` should pull in `@xterm/xterm` and addons
3. The `TerminalEmulator.svelte` component should compile without TypeScript errors
4. To smoke test the component in isolation, temporarily mount it in any screen and you should see a working bash terminal with the DeckForge color scheme

**Quick verification:** Add this temporarily to any screen:
```svelte
<TerminalEmulator cwd="/tmp" />
```

You should see a fully interactive bash shell with cyan cursor and DeckForge dark background. Type `ls`, `echo hello`, etc. — it should behave exactly like a normal terminal.

## Testing

Run existing tests to make sure nothing broke:
```bash
npm run test
npm run test:e2e
```

The new component is purely additive so existing tests should pass unchanged.

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| `src-tauri/Cargo.toml` | Add `portable-pty = "0.9"` | Rust PTY library |
| `src-tauri/src/lib.rs` | Add PtyState + 4 commands + base64 helper | PTY lifecycle management |
| `package.json` | Add xterm.js + addons | Terminal rendering |
| `src/lib/components/TerminalEmulator.svelte` | New file | xterm.js wrapper component |
| `src/app.css` (or main.ts) | Import xterm.css | Terminal styling |
