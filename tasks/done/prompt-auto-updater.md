# Task: In-App Auto-Updater via GitHub Releases

## Goal

Add an auto-update system to DeckForge that checks GitHub Releases for new versions and lets the user update with a single button press. No SSH, no sudo, no terminal commands on the Steam Deck. The user just sees "Update available" and presses A.

## Context

- DeckForge is a public GitHub repo
- CI already builds Linux AppImages and creates GitHub releases when tags are pushed (`.github/workflows/build.yml`)
- The app runs as an AppImage on the Steam Deck from a user-writable directory (e.g., `~/DeckForge/`)
- The user cannot sudo on the Deck
- Current version is in `src-tauri/tauri.conf.json` → `"version": "0.1.0"`

## Architecture

```
App startup
  → Rust command: check_for_update()
  → Hits GitHub Releases API: GET /repos/{owner}/{repo}/releases/latest
  → Compares release tag (v0.2.0) vs current version (0.1.0)
  → If newer: returns update info (version, download URL, release notes)
  → Frontend shows update banner / settings option
  → User presses "Update"
  → Rust command: download_update(url)
  → Downloads new AppImage to staging path
  → Swaps with current binary
  → Prompts user to restart
```

## Changes Required

### 1. Rust Dependencies — `src-tauri/Cargo.toml`

Add:

```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
tokio = { version = "1", features = ["fs"] }
```

`reqwest` for HTTP requests to GitHub API. Using `rustls-tls` instead of native OpenSSL to avoid system dependency issues on SteamOS.

### 2. Rust Update Module — `src-tauri/src/updater.rs`

Create this new file:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

const GITHUB_OWNER: &str = "mdeeb95";
const GITHUB_REPO: &str = "DeckForge";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION"); // reads from Cargo.toml via tauri.conf.json

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub version: String,
    pub body: String, // release notes
    pub download_url: String,
    pub download_size: u64,
    pub published_at: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

/// Check GitHub Releases for a newer version.
/// Returns Some(ReleaseInfo) if an update is available, None if current.
#[tauri::command]
pub async fn check_for_update() -> Result<Option<ReleaseInfo>, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        GITHUB_OWNER, GITHUB_REPO
    );

    let client = reqwest::Client::builder()
        .user_agent("DeckForge-Updater")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    if response.status() == 404 {
        // No releases yet
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(format!("GitHub API returned status {}", response.status()));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    // Parse version from tag (strip leading 'v')
    let remote_version = release.tag_name.trim_start_matches('v');

    // Simple semver comparison
    if !is_newer(remote_version, CURRENT_VERSION) {
        return Ok(None);
    }

    // Find the Linux AppImage asset
    let appimage_asset = release
        .assets
        .iter()
        .find(|a| a.name.ends_with(".AppImage"))
        .ok_or_else(|| "No AppImage found in release".to_string())?;

    Ok(Some(ReleaseInfo {
        tag_name: release.tag_name.clone(),
        version: remote_version.to_string(),
        body: release.body.unwrap_or_default(),
        download_url: appimage_asset.browser_download_url.clone(),
        download_size: appimage_asset.size,
        published_at: release.published_at.unwrap_or_default(),
    }))
}

/// Download the update AppImage and stage it for swap.
/// Returns the path to the staged file.
#[tauri::command]
pub async fn download_update(app: AppHandle, url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("DeckForge-Updater")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download returned status {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    // Get the current executable's directory
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {}", e))?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| "Failed to get exe directory".to_string())?;

    // Stage the new AppImage next to the current binary
    let staged_path = exe_dir.join("DeckForge.AppImage.new");

    tokio::fs::write(&staged_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write staged update: {}", e))?;

    // Make it executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&staged_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    Ok(staged_path.to_string_lossy().into_owned())
}

/// Apply a staged update by swapping the binaries.
/// The old binary is renamed to .old (as backup), the new one takes its place.
#[tauri::command]
pub async fn apply_update(staged_path: String) -> Result<(), String> {
    let staged = PathBuf::from(&staged_path);
    if !staged.exists() {
        return Err("Staged update file not found".to_string());
    }

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {}", e))?;

    let backup_path = current_exe.with_extension("AppImage.old");

    // Rename current → .old (backup)
    if current_exe.exists() {
        tokio::fs::rename(&current_exe, &backup_path)
            .await
            .map_err(|e| format!("Failed to backup current binary: {}", e))?;
    }

    // Rename staged → current
    tokio::fs::rename(&staged, &current_exe)
        .await
        .map_err(|e| {
            // Try to restore backup
            let _ = std::fs::rename(&backup_path, &current_exe);
            format!("Failed to apply update: {}", e)
        })?;

    // Clean up old backup from previous updates
    let _ = tokio::fs::remove_file(&backup_path).await;

    Ok(())
}

/// Simple semver comparison: is `remote` newer than `current`?
fn is_newer(remote: &str, current: &str) -> bool {
    let parse = |v: &str| -> (u32, u32, u32) {
        let parts: Vec<u32> = v
            .split('.')
            .filter_map(|s| s.parse().ok())
            .collect();
        (
            parts.first().copied().unwrap_or(0),
            parts.get(1).copied().unwrap_or(0),
            parts.get(2).copied().unwrap_or(0),
        )
    };
    parse(remote) > parse(current)
}

/// Clean up any leftover staged files on startup.
pub fn cleanup_staged_files() {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let staged = dir.join("DeckForge.AppImage.new");
            let backup = exe.with_extension("AppImage.old");
            let _ = std::fs::remove_file(staged);
            let _ = std::fs::remove_file(backup);
        }
    }
}
```

### 3. Register in `src-tauri/src/lib.rs`

Add `mod updater;` at the top.

In the `run()` function, register the new commands:

```rust
.invoke_handler(tauri::generate_handler![
    get_system_stats,
    updater::check_for_update,
    updater::download_update,
    updater::apply_update,
])
```

Add cleanup call in the `setup` closure:

```rust
.setup(|app| {
    updater::cleanup_staged_files();
    // ... existing log setup ...
    Ok(())
})
```

### 4. Frontend — Update Store — `src/lib/stores/updater.ts`

Create this new store file:

```typescript
import { writable } from 'svelte/store';

export interface UpdateInfo {
  tagName: string;
  version: string;
  body: string;
  downloadUrl: string;
  downloadSize: number;
  publishedAt: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export const updateInfo = writable<UpdateInfo | null>(null);
export const updateStatus = writable<UpdateStatus>('idle');
export const updateError = writable<string | null>(null);
export const updateProgress = writable<number>(0); // 0-100
```

### 5. Frontend — Update Checker — `src/lib/system/updateChecker.ts`

```typescript
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
      devLog('updater', `Update available: ${info.version}`);
    } else {
      updateStatus.set('idle');
      devLog('updater', 'App is up to date');
    }
  } catch (error) {
    // Don't bother the user if update check fails — it's not critical
    devError('updater', 'Update check failed', error);
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
    devLog('updater', `Update downloaded to ${stagedPath}`);

    // Apply it (swap binaries)
    await invoke('apply_update', { stagedPath });
    devLog('updater', 'Update applied — restart needed');

    updateStatus.set('ready');
  } catch (error) {
    devError('updater', 'Update failed', error);
    updateStatus.set('error');
    updateError.set(String(error));
  }
}
```

### 6. Frontend — Call on Startup — `src/App.svelte`

In the `onMount` block (alongside existing startup tasks like Claude discovery and config init), add a non-blocking update check:

```typescript
import { checkForUpdate } from './lib/system/updateChecker';

onMount(() => {
  // ... existing startup code ...

  // Check for updates in the background (non-blocking, silent failure)
  if (isTauri()) {
    checkForUpdate();
  }
});
```

Where `isTauri()` is the existing check for Tauri environment. Don't check in browser dev mode.

### 7. Frontend — Update Banner in Level 1 Screen

Add a subtle, non-intrusive update notification on the L1 (Category Select) screen. This is where the user lands, so they'll see it immediately.

In the relevant screen component (Level1Screen or wherever the action palette header is), add:

```svelte
<script>
  import { updateInfo, updateStatus } from '../stores/updater';
  import { downloadAndApply } from '../system/updateChecker';
</script>

{#if $updateStatus === 'available' && $updateInfo}
  <div class="mx-3 mb-2 p-2 rounded border border-primary/30 bg-primary/10 flex items-center justify-between">
    <div>
      <span class="text-xs text-primary font-bold">Update {$updateInfo.version}</span>
      <span class="text-[10px] text-slate-400 ml-2">available</span>
    </div>
    <button
      class="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
      onclick={() => downloadAndApply($updateInfo.downloadUrl)}
    >
      Install
    </button>
  </div>
{:else if $updateStatus === 'downloading'}
  <div class="mx-3 mb-2 p-2 rounded border border-primary/30 bg-primary/10">
    <span class="text-xs text-primary animate-pulse">Downloading update...</span>
  </div>
{:else if $updateStatus === 'ready'}
  <div class="mx-3 mb-2 p-2 rounded border border-emerald-400/30 bg-emerald-400/10">
    <span class="text-xs text-emerald-400 font-bold">Update installed! Restart DeckForge to use {$updateInfo?.version}</span>
  </div>
{:else if $updateStatus === 'error'}
  <div class="mx-3 mb-2 p-2 rounded border border-red-400/30 bg-red-400/10">
    <span class="text-xs text-red-400">Update failed. Try again later.</span>
  </div>
{/if}
```

### 8. Settings Screen — Manual Update Check

Also add an "Check for Updates" option in the Settings screen so users can manually trigger it:

```svelte
<ActionCard
  title="Check for Updates"
  description={$updateStatus === 'available' ? `${$updateInfo?.version} available` : 'You're on the latest version'}
  variant="primary"
  onclick={() => checkForUpdate()}
/>
```

### 9. GitHub CI — Ensure Releases Are Created Properly

The existing `.github/workflows/build.yml` already creates releases on tag push. Verify the release includes the AppImage asset. The `tauri-apps/tauri-action@v0` should handle this automatically, but double-check that the `tagName` and `releaseName` are set correctly:

```yaml
- name: Build Tauri app
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tagName: ${{ github.ref_name }}
    releaseName: 'DeckForge ${{ github.ref_name }}'
    releaseBody: 'See the commit history for changes in this release.'
    releaseDraft: false
    prerelease: false
```

Note: the current config only creates releases when `github.ref_type == 'tag'` and uses `releaseDraft: true`. Change `releaseDraft` to `false` so releases are published immediately (otherwise the API's `/releases/latest` won't find them — drafts are hidden from that endpoint).

### 10. Version Bumping Workflow

To release a new version:

```bash
# On your dev machine after merging changes:
# 1. Bump version in src-tauri/tauri.conf.json ("version": "0.2.0")
# 2. Bump version in src-tauri/Cargo.toml (version = "0.2.0")
# 3. Commit and tag:
git add -A && git commit -m "Release v0.2.0"
git tag v0.2.0
git push && git push --tags
```

CI builds the AppImage, creates a GitHub release with the tag, attaches the AppImage. The Deck's auto-updater picks it up on next launch.

## What NOT to Change

- **Don't use Tauri's built-in updater plugin** — it requires code signing and a custom update server endpoint. Overkill for a dev tool on your own Deck.
- **Don't auto-apply updates** — always show the user what's available and let them choose. Auto-updating a running app is a recipe for data loss.
- **Don't block startup on update check** — fire-and-forget. If the GitHub API is slow or offline, the app works fine.

## How to Verify

1. Build and push a tag: `git tag v0.1.1 && git push --tags`
2. Wait for CI to create the release
3. Launch DeckForge on the Deck
4. The L1 screen should show "Update 0.1.1 available"
5. Press Install → should download and stage the new binary
6. Banner changes to "Update installed! Restart to use 0.1.1"
7. Restart the app → should be running the new version
8. L1 should no longer show an update banner

## Testing

Unit test for version comparison:

```typescript
// src/test/system/updater.test.ts
import { describe, it, expect } from 'vitest';

describe('Version comparison', () => {
  // Mirror the Rust is_newer logic
  function isNewer(remote: string, current: string): boolean {
    const parse = (v: string) => v.split('.').map(Number);
    const r = parse(remote);
    const c = parse(current);
    for (let i = 0; i < 3; i++) {
      if ((r[i] ?? 0) > (c[i] ?? 0)) return true;
      if ((r[i] ?? 0) < (c[i] ?? 0)) return false;
    }
    return false;
  }

  it('detects newer major version', () => {
    expect(isNewer('1.0.0', '0.1.0')).toBe(true);
  });

  it('detects newer minor version', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
  });

  it('detects newer patch version', () => {
    expect(isNewer('0.1.1', '0.1.0')).toBe(true);
  });

  it('returns false for same version', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
  });

  it('returns false for older version', () => {
    expect(isNewer('0.0.9', '0.1.0')).toBe(false);
  });

  it('handles missing patch number', () => {
    expect(isNewer('0.2', '0.1.0')).toBe(true);
  });
});
```

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| `src-tauri/Cargo.toml` | Add `reqwest`, `tokio` | HTTP client for GitHub API |
| `src-tauri/src/updater.rs` | New file | Check, download, apply updates |
| `src-tauri/src/lib.rs` | Register updater commands, add cleanup | Wire into Tauri |
| `src/lib/stores/updater.ts` | New file | Update state management |
| `src/lib/system/updateChecker.ts` | New file | Frontend update logic |
| `src/App.svelte` | Add startup update check | Non-blocking check on launch |
| Level1 screen component | Add update banner | User-visible notification |
| Settings screen | Add manual check button | Manual trigger option |
| `.github/workflows/build.yml` | Fix releaseDraft to false | Make releases visible to API |
| `src/test/system/updater.test.ts` | New file | Version comparison tests |
