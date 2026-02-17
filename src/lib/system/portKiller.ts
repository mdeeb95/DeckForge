// ─── Port Killer — kill process occupying a specific port ────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Kill whatever process is listening on the given port.
 * Uses `lsof -ti:<port> | xargs kill -9` via Tauri shell.
 * Returns true if the command ran successfully.
 */
export async function killPort(port: number): Promise<boolean> {
  // Validate port to prevent injection
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[portKiller] Invalid port: ${port}`);
    return false;
  }

  if (!isTauri()) {
    console.log(`[portKiller] Mock kill port ${port}`);
    return true;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const cmd = Command.create('sh', ['-c', `lsof -ti:${port} | xargs kill -9`]);
    const output = await cmd.execute();

    if (output.code === 0) {
      console.log(`[portKiller] Killed process on port ${port}`);
      return true;
    }

    // code 1 from xargs usually means no process found — still "success"
    if (output.code === 123 || output.stderr.includes('No such process')) {
      console.log(`[portKiller] No process found on port ${port}`);
      return true;
    }

    console.warn(`[portKiller] Kill exited with code ${output.code}: ${output.stderr}`);
    return false;
  } catch (error) {
    console.error('[portKiller] Failed:', error);
    return false;
  }
}
