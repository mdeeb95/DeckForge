import { invoke } from '@tauri-apps/api/core';
import { updateInfo, updateStatus, updateError, type UpdateInfo } from '../stores/updater';
import { devLog, devError } from '../utils/devLog';

let stagedPath: string | null = null;

/**
 * Check GitHub for a newer version. Call on app startup.
 * Non-blocking — silently sets store values.
 */
export async function checkForUpdate(): Promise<void> {
  try {
    updateStatus.set('checking');
    const info = await invoke<UpdateInfo | null>('check_for_update');

    if (info) {
      updateInfo.set(info);
      updateStatus.set('available');
      devLog('lifecycle', `Update available: ${info.version}`);
    } else {
      updateStatus.set('idle');
      devLog('lifecycle', 'App is up to date');
    }
  } catch (error) {
    // Don't bother the user if update check fails — it's not critical
    devError('lifecycle', 'Update check failed', error);
    updateStatus.set('idle');
  }
}

/**
 * Download and apply the update. Call when user confirms.
 */
export async function downloadAndApply(downloadUrl: string): Promise<void> {
  try {
    updateStatus.set('downloading');
    updateError.set(null);

    // Download the AppImage
    stagedPath = await invoke<string>('download_update', { url: downloadUrl });
    devLog('lifecycle', `Update downloaded to ${stagedPath}`);

    // Apply it (swap binaries)
    await invoke('apply_update', { stagedPath });
    devLog('lifecycle', 'Update applied — restarting');

    // Auto-restart into the new binary
    await invoke('restart_app');
  } catch (error) {
    devError('lifecycle', 'Update failed', error);
    updateStatus.set('error');
    updateError.set(String(error));
  }
}
