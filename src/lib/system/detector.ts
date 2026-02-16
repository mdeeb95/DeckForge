// ─── Auto-detect run commands for known project types ────────────────────────

interface DetectionResult {
  command: string;
  source: string;
  autoDetected: boolean;
}

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

/**
 * Scan a project directory and detect the most likely run command.
 * Uses Tauri FS plugin — no shell commands.
 * Detection order (first match wins):
 *  1. package.json → scripts.dev or scripts.start
 *  2. Cargo.toml → cargo run
 *  3. project.godot → godot --path .
 *  4. Makefile → make
 *  5. main.py → python3 main.py
 *  6. index.html → npx serve .
 */
export async function autoDetectRunCommand(projectPath: string): Promise<DetectionResult> {
  if (!isTauri()) {
    console.log('[detector] Not in Tauri — returning mock detection');
    return { command: 'npm run dev', source: 'mock', autoDetected: true };
  }

  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');

    // 1. package.json
    const packageJsonPath = joinPath(projectPath, 'package.json');
    if (await exists(packageJsonPath)) {
      try {
        const content = await readTextFile(packageJsonPath);
        const pkg = JSON.parse(content);
        if (pkg.scripts?.dev) {
          return { command: 'npm run dev', source: 'package.json scripts.dev', autoDetected: true };
        }
        if (pkg.scripts?.start) {
          return { command: 'npm start', source: 'package.json scripts.start', autoDetected: true };
        }
      } catch {
        // Invalid JSON — skip
      }
      return { command: 'npm start', source: 'package.json (fallback)', autoDetected: true };
    }

    // 2. Cargo.toml
    if (await exists(joinPath(projectPath, 'Cargo.toml'))) {
      return { command: 'cargo run', source: 'Cargo.toml', autoDetected: true };
    }

    // 3. project.godot
    if (await exists(joinPath(projectPath, 'project.godot'))) {
      return { command: 'godot --path .', source: 'project.godot', autoDetected: true };
    }

    // 4. Makefile
    if (await exists(joinPath(projectPath, 'Makefile'))) {
      return { command: 'make', source: 'Makefile', autoDetected: true };
    }

    // 5. main.py
    if (await exists(joinPath(projectPath, 'main.py'))) {
      return { command: 'python3 main.py', source: 'main.py', autoDetected: true };
    }

    // 6. index.html
    if (await exists(joinPath(projectPath, 'index.html'))) {
      return { command: 'npx serve .', source: 'index.html', autoDetected: true };
    }
  } catch (error) {
    console.error('[detector] Auto-detect failed:', error);
  }

  return { command: '', source: '', autoDetected: false };
}
