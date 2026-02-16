// ─── Window Manager — RT/LT switching between DeckForge and target app ───────

type DisplayServer = 'wayland' | 'x11' | 'macos' | 'unknown';

// ─── Module state ────────────────────────────────────────────────────────────

let displayServer: DisplayServer = 'unknown';
let appWindowClass = '';
let initialized = false;

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect the display server and prepare for window switching.
 * Call once when a project is opened.
 */
export async function initWindowManager(): Promise<void> {
  if (!isTauri()) {
    displayServer = 'macos'; // Assume macOS in dev mode
    initialized = true;
    console.log('[windowManager] Init (mock mode) — displayServer:', displayServer);
    return;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    // Check for Wayland
    try {
      const waylandCheck = Command.create('sh', ['-c', 'echo $WAYLAND_DISPLAY']);
      const waylandResult = await waylandCheck.execute();
      if (waylandResult.stdout.trim()) {
        displayServer = 'wayland';
        initialized = true;
        console.log('[windowManager] Detected Wayland');
        return;
      }
    } catch { /* not wayland */ }

    // Check for X11
    try {
      const x11Check = Command.create('sh', ['-c', 'echo $DISPLAY']);
      const x11Result = await x11Check.execute();
      if (x11Result.stdout.trim()) {
        displayServer = 'x11';
        initialized = true;
        console.log('[windowManager] Detected X11');
        return;
      }
    } catch { /* not x11 */ }

    // Fallback: check platform
    const platform = navigator.platform?.toLowerCase() ?? '';
    if (platform.includes('mac')) {
      displayServer = 'macos';
    }

    initialized = true;
    console.log('[windowManager] Display server:', displayServer);
  } catch (error) {
    console.error('[windowManager] Init failed:', error);
    initialized = true;
  }
}

/**
 * Switch focus to the user's app window (RT trigger).
 */
export async function switchToApp(): Promise<void> {
  if (!appWindowClass) {
    console.warn('[windowManager] No app window class set');
    return;
  }

  if (!isTauri()) {
    console.log('[windowManager] switchToApp →', appWindowClass);
    return;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    switch (displayServer) {
      case 'wayland': {
        const cmd = Command.create('wlrctl', ['toplevel', 'focus', appWindowClass]);
        await cmd.execute();
        break;
      }
      case 'x11': {
        const cmd = Command.create('wmctrl', ['-a', appWindowClass]);
        await cmd.execute();
        break;
      }
      case 'macos': {
        const script = `tell application "${appWindowClass}" to activate`;
        const cmd = Command.create('osascript', ['-e', script]);
        await cmd.execute();
        break;
      }
      default:
        console.warn('[windowManager] Unknown display server, cannot switch');
    }
  } catch (error) {
    console.error('[windowManager] switchToApp failed:', error);
  }
}

/**
 * Switch focus back to DeckForge (LT trigger).
 */
export async function switchToDeckForge(): Promise<void> {
  if (!isTauri()) {
    console.log('[windowManager] switchToDeckForge');
    return;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    switch (displayServer) {
      case 'wayland': {
        const cmd = Command.create('wlrctl', ['toplevel', 'focus', 'DeckForge']);
        await cmd.execute();
        break;
      }
      case 'x11': {
        const cmd = Command.create('wmctrl', ['-a', 'DeckForge']);
        await cmd.execute();
        break;
      }
      case 'macos': {
        const script = 'tell application "DeckForge" to activate';
        const cmd = Command.create('osascript', ['-e', script]);
        await cmd.execute();
        break;
      }
      default:
        console.warn('[windowManager] Unknown display server, cannot switch');
    }
  } catch (error) {
    console.error('[windowManager] switchToDeckForge failed:', error);
  }
}

/**
 * Update the tracked app window class/name.
 */
export function setAppWindowClass(cls: string): void {
  appWindowClass = cls;
  console.log('[windowManager] App window class set to:', cls);
}

/**
 * Get current display server type (for debugging/UI).
 */
export function getDisplayServer(): DisplayServer {
  return displayServer;
}

/**
 * Check if window manager has been initialized.
 */
export function isInitialized(): boolean {
  return initialized;
}
