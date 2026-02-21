mod audio;
mod updater;

use std::sync::Mutex;
use std::io::{Read, Write};
use std::net::TcpListener;
use sysinfo::System;
use tauri::State;

struct SystemState(Mutex<System>);

#[derive(serde::Serialize)]
struct SystemStats {
    cpu: f32,
    ram: f32,
}

#[tauri::command]
fn get_system_stats(state: State<SystemState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu = (sys.global_cpu_usage() * 10.0).round() / 10.0;
    let total = sys.total_memory() as f64;
    let used = sys.used_memory() as f64;
    let ram = if total > 0.0 {
        ((used / total * 1000.0).round() / 10.0) as f32
    } else {
        0.0
    };

    SystemStats { cpu, ram }
}

/// One-shot HTTP listener for OAuth callback.
/// Binds to localhost:{port}, waits for Google to redirect with ?code=...&state=...,
/// validates the state parameter, and returns the authorization code.
#[tauri::command]
async fn start_oauth_listener(port: u16, expected_state: String) -> Result<String, String> {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;
    // Set a timeout so we don't block forever
    listener.set_nonblocking(false).ok();

    // Accept a single connection
    let (mut stream, _) = listener.accept().map_err(|e| format!("Accept failed: {}", e))?;

    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(|e| format!("Read failed: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse the GET request line for query params
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");

    // Send a response immediately so the browser shows something nice
    let success_html = r#"<!DOCTYPE html><html><body style="background:#0d1117;color:#0df2f2;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>&#10003; Signed in to DeckForge</h1><p style="color:#8b949e">You can close this tab and return to the app.</p></div></body></html>"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        success_html.len(),
        success_html
    );
    let _ = stream.write_all(response.as_bytes());
    drop(stream);
    drop(listener);

    // Extract query params from path like /auth/callback?code=xxx&state=yyy
    let query = path.split('?').nth(1).unwrap_or("");
    let mut code: Option<String> = None;
    let mut state: Option<String> = None;

    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        match (kv.next(), kv.next()) {
            (Some("code"), Some(v)) => code = Some(urldecode(v)),
            (Some("state"), Some(v)) => state = Some(urldecode(v)),
            _ => {}
        }
    }

    // Check for error parameter
    if let Some(error_param) = query.split('&').find(|p| p.starts_with("error=")) {
        let error = error_param.strip_prefix("error=").unwrap_or("unknown");
        return Err(format!("Google OAuth error: {}", urldecode(error)));
    }

    let state_val = state.ok_or("Missing state parameter in callback")?;
    if state_val != expected_state {
        return Err("OAuth state mismatch — possible CSRF attack".to_string());
    }

    code.ok_or_else(|| "Missing authorization code in callback".to_string())
}

/// Simple percent-decoding for URL query params
fn urldecode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let audio_state = std::sync::Mutex::new(audio::AudioState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SystemState(Mutex::new(sys)))
        .manage(audio_state)
        .invoke_handler(tauri::generate_handler![
            get_system_stats,
            updater::check_for_update,
            updater::download_update,
            updater::apply_update,
            updater::restart_app,
            audio::play_sound,
            start_oauth_listener,
        ])
        .setup(|app| {
            updater::cleanup_staged_files();
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
