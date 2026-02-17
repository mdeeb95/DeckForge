use std::sync::Mutex;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut sys = System::new_all();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SystemState(Mutex::new(sys)))
        .invoke_handler(tauri::generate_handler![get_system_stats])
        .setup(|app| {
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
