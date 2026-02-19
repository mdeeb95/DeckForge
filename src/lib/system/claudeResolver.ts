import { writable } from 'svelte/store';

export const claudePath = writable<string | null>(null);
export const claudeStatus = writable<'searching' | 'found' | 'not_found'>('searching');

/**
 * Probe common install locations for the `claude` CLI binary.
 * Returns the first absolute path found, or null.
 */
export async function discoverClaude(): Promise<string | null> {
  // Outside Tauri (browser dev), skip discovery
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    claudePath.set(null);
    claudeStatus.set('not_found');
    return null;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');

    // Single sh invocation: try PATH first, then probe common dirs
    const probe = `command -v claude 2>/dev/null || { for d in "$HOME/.nvm/versions/node"/*/bin "$HOME/.local/bin" "$HOME/.npm-global/bin" "/usr/local/bin"; do [ -x "$d/claude" ] && echo "$d/claude" && exit 0; done; }`;

    const output = await Command.create('sh', ['-c', probe]).execute();
    const resolved = output.stdout.trim().split('\n')[0]?.trim();

    if (resolved && resolved.length > 0) {
      claudePath.set(resolved);
      claudeStatus.set('found');
      console.log(`[claudeResolver] Found claude at: ${resolved}`);
      return resolved;
    }

    claudePath.set(null);
    claudeStatus.set('not_found');
    console.warn('[claudeResolver] Claude CLI not found in any known location');
    return null;
  } catch (error) {
    console.error('[claudeResolver] Discovery failed:', error);
    claudePath.set(null);
    claudeStatus.set('not_found');
    return null;
  }
}
