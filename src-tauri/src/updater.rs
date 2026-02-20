use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const GITHUB_OWNER: &str = "mdeeb95";
const GITHUB_REPO: &str = "DeckForge";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Read cached ETag from a file next to the executable.
/// Returns None silently on any error.
fn read_cached_etag() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let etag_path = exe.parent()?.join(".updater_etag");
    std::fs::read_to_string(etag_path).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Write ETag to a file next to the executable.
/// Errors silently ignored.
fn write_cached_etag(etag: &str) {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let _ = std::fs::write(dir.join(".updater_etag"), etag);
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub version: String,
    pub body: String,
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

    let mut request = client.get(&url);
    if let Some(etag) = read_cached_etag() {
        request = request.header("If-None-Match", etag);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    // 304 Not Modified — cached ETag matched, no update
    if response.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(None);
    }

    if response.status() == 404 {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(format!("GitHub API returned status {}", response.status()));
    }

    // Save new ETag from response
    if let Some(etag) = response.headers().get("etag").and_then(|v| v.to_str().ok()) {
        write_cached_etag(etag);
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    let remote_version = release.tag_name.trim_start_matches('v');

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
pub async fn download_update(url: String) -> Result<String, String> {
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

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {}", e))?;
    let exe_dir = current_exe
        .parent()
        .ok_or_else(|| "Failed to get exe directory".to_string())?;

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

    // Clean up old backup
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

/// Restart the app by spawning the current exe and exiting.
/// Used after an update is applied so the new binary takes over.
#[tauri::command]
pub fn restart_app() -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe: {}", e))?;

    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| format!("Failed to spawn new process: {}", e))?;

    std::process::exit(0);
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
