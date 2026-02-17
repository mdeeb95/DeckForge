// ─── App Launcher — spawn, kill, restart the user's app process ──────────────

import { appRunning, appPid, lastLaunchError, appOutput } from '../stores/launcher';
import { activeTab } from '../stores/terminal';

// ─── Module state ────────────────────────────────────────────────────────────

interface ChildHandle {
  kill: () => Promise<void>;
  pid: number;
}

let childProcess: ChildHandle | null = null;
let running = false;
let currentCommand = '';
let currentCwd = '';

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Launch the app process with the given command and working directory.
 */
export async function launchApp(command: string, cwd: string): Promise<void> {
  if (!command) {
    lastLaunchError.set('No run command configured');
    return;
  }

  if (running) {
    console.warn('[appLauncher] App already running — kill first');
    return;
  }

  currentCommand = command;
  currentCwd = cwd;
  lastLaunchError.set(null);
  appOutput.set([]);

  if (!isTauri()) {
    // Mock mode
    console.log(`[appLauncher] Mock launch: ${command} in ${cwd}`);
    running = true;
    appRunning.set(true);
    appPid.set(9999);
    activeTab.set('app');

    // Simulate output
    setTimeout(() => {
      appOutput.update(lines => [...lines, `[mock] Running: ${command}`]);
    }, 300);
    return;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    const cmd = Command.create('sh', ['-c', command], { cwd });

    cmd.stdout.on('data', (line: string) => {
      appOutput.update(lines => {
        const updated = [...lines, line];
        // Keep last 200 lines
        return updated.length > 200 ? updated.slice(-200) : updated;
      });
    });

    cmd.stderr.on('data', (line: string) => {
      appOutput.update(lines => {
        const updated = [...lines, `[stderr] ${line}`];
        return updated.length > 200 ? updated.slice(-200) : updated;
      });
    });

    cmd.on('close', (data: { code: number | null }) => {
      running = false;
      childProcess = null;
      appRunning.set(false);
      appPid.set(null);
      console.log(`[appLauncher] Process exited with code ${data.code}`);
    });

    cmd.on('error', (error: string) => {
      running = false;
      childProcess = null;
      appRunning.set(false);
      appPid.set(null);
      lastLaunchError.set(error);
      console.error('[appLauncher] Process error:', error);
    });

    const child = await cmd.spawn();
    childProcess = {
      kill: () => child.kill(),
      pid: child.pid,
    };

    running = true;
    appRunning.set(true);
    appPid.set(child.pid);
    activeTab.set('app');
    console.log(`[appLauncher] Launched PID ${child.pid}: ${command}`);
  } catch (error) {
    running = false;
    appRunning.set(false);
    appPid.set(null);
    const msg = error instanceof Error ? error.message : String(error);
    lastLaunchError.set(msg);
    console.error('[appLauncher] Launch failed:', error);
  }
}

/**
 * Kill the running app process.
 */
export async function killApp(): Promise<void> {
  if (!isTauri()) {
    console.log('[appLauncher] Mock kill');
    running = false;
    appRunning.set(false);
    appPid.set(null);
    childProcess = null;
    return;
  }

  if (!childProcess) {
    console.warn('[appLauncher] No process to kill');
    return;
  }

  try {
    await childProcess.kill();
    childProcess = null;
    running = false;
    appRunning.set(false);
    appPid.set(null);
    console.log('[appLauncher] Process killed');
  } catch (error) {
    console.error('[appLauncher] Kill failed:', error);
    lastLaunchError.set(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Restart the app: kill current process, then relaunch with saved command/cwd.
 */
export async function restartApp(): Promise<void> {
  if (!currentCommand) {
    console.warn('[appLauncher] No command saved — cannot restart');
    lastLaunchError.set('No command saved — launch the app first');
    return;
  }

  console.log('[appLauncher] Restarting app...');
  await killApp();

  // Brief delay to let the process fully exit
  await new Promise(r => setTimeout(r, 200));

  await launchApp(currentCommand, currentCwd);
}

/**
 * Check if app is currently running.
 */
export function isRunning(): boolean {
  return running;
}

/**
 * Get the current run command (for display/debug).
 */
export function getCurrentCommand(): string {
  return currentCommand;
}
