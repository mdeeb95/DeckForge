// ─── Screenshot Capture — RB triggered, platform-aware ──────────────────────

import { getDisplayServer } from './windowManager';
import type { ScreenshotMeta } from '../types/data';

interface CaptureResult {
  path: string;
  metaPath: string;
  meta: ScreenshotMeta;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Build an ISO-based filename safe for filesystems (colons replaced with dashes).
 */
function buildFilename(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
  return `${ts}.png`;
}

/**
 * Capture a screenshot and save it with metadata sidecar.
 */
export async function captureScreenshot(
  projectPath: string,
  sessionNumber: number,
): Promise<CaptureResult> {
  const filename = buildFilename();
  const dir = `${projectPath}/.deckforge/screenshots`;
  const outputPath = `${dir}/${filename}`;
  const metaPath = `${dir}/${filename}.meta.json`;

  const meta: ScreenshotMeta = {
    captured_at: new Date().toISOString(),
    session_number: sessionNumber,
    source_window: 'DeckForge',
    sent_to_claude_code: false,
    voice_annotation: null,
    triggered_task: false,
  };

  if (!isTauri()) {
    console.log('[screenshot] Mock capture →', outputPath);
    console.log('[screenshot] Meta:', meta);
    return { path: outputPath, metaPath, meta };
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const { exists, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');

    // Ensure screenshots directory exists
    const dirExists = await exists(dir);
    if (!dirExists) {
      await mkdir(dir, { recursive: true });
    }

    // Run platform-specific capture command
    const server = getDisplayServer();
    let cmd;

    switch (server) {
      case 'wayland':
        cmd = Command.create('grim', [outputPath]);
        break;
      case 'x11':
        cmd = Command.create('scrot', [outputPath]);
        break;
      case 'macos':
        cmd = Command.create('screencapture', ['-x', outputPath]);
        break;
      default:
        throw new Error(`Unsupported display server: ${server}`);
    }

    const result = await cmd.execute();
    if (result.code !== 0) {
      throw new Error(`Screenshot command failed (exit ${result.code}): ${result.stderr}`);
    }

    // Write metadata sidecar
    await writeTextFile(metaPath, JSON.stringify(meta, null, 2));

    console.log('[screenshot] Captured →', outputPath);
    return { path: outputPath, metaPath, meta };
  } catch (error) {
    console.error('[screenshot] Capture failed:', error);
    throw error;
  }
}
