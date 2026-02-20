use rodio::{Decoder, OutputStream, Sink};
use std::io::Cursor;
use std::sync::mpsc;
use std::sync::Mutex;
use tauri::State;

// ── Embed MP3 files at compile time (~97KB total) ────────────────────
static NAV: &[u8] = include_bytes!("../../src/assets/sfx/nav.mp3");
static CLICK: &[u8] = include_bytes!("../../src/assets/sfx/click.mp3");
static SUCCESS: &[u8] = include_bytes!("../../src/assets/sfx/success.mp3");
static ERROR: &[u8] = include_bytes!("../../src/assets/sfx/error.mp3");
static BACK: &[u8] = include_bytes!("../../src/assets/sfx/back.mp3");
static CAPTURE: &[u8] = include_bytes!("../../src/assets/sfx/capture.mp3");
static TOGGLE: &[u8] = include_bytes!("../../src/assets/sfx/toggle.mp3");
static MENU_OPEN: &[u8] = include_bytes!("../../src/assets/sfx/menu-open.mp3");
static MENU_CLOSE: &[u8] = include_bytes!("../../src/assets/sfx/menu-close.mp3");
static REROLL: &[u8] = include_bytes!("../../src/assets/sfx/reroll.mp3");
static SHIP_IT: &[u8] = include_bytes!("../../src/assets/sfx/ship-it.mp3");

struct AudioCommand {
    name: String,
    volume: f32,
}

// ── Audio state — sends commands to a dedicated audio thread ─────────
// OutputStream is !Send (cpal raw pointers), so it can't live in Tauri
// managed state. Instead, a background thread owns the stream and we
// communicate via channel. Sender<T> is Send, so Tauri is happy.
pub struct AudioState {
    sender: Option<mpsc::Sender<AudioCommand>>,
}

impl AudioState {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<AudioCommand>();

        std::thread::spawn(move || {
            let (_stream, handle) = match OutputStream::try_default() {
                Ok(pair) => pair,
                Err(e) => {
                    eprintln!("Audio output unavailable: {e} — sound effects disabled");
                    return;
                }
            };

            for cmd in rx {
                let data = match get_sound_data(&cmd.name) {
                    Some(d) => d,
                    None => continue,
                };

                match Sink::try_new(&handle) {
                    Ok(sink) => {
                        let cursor = Cursor::new(data);
                        match Decoder::new(cursor) {
                            Ok(source) => {
                                sink.set_volume(cmd.volume);
                                sink.append(source);
                                sink.detach();
                            }
                            Err(e) => eprintln!("Failed to decode sound '{}': {e}", cmd.name),
                        }
                    }
                    Err(e) => eprintln!("Failed to create audio sink: {e}"),
                }
            }
        });

        AudioState { sender: Some(tx) }
    }
}

fn get_sound_data(name: &str) -> Option<&'static [u8]> {
    match name {
        "nav" => Some(NAV),
        "click" => Some(CLICK),
        "success" => Some(SUCCESS),
        "error" => Some(ERROR),
        "back" => Some(BACK),
        "capture" => Some(CAPTURE),
        "toggle" => Some(TOGGLE),
        "menuOpen" => Some(MENU_OPEN),
        "menuClose" => Some(MENU_CLOSE),
        "reroll" => Some(REROLL),
        "shipIt" => Some(SHIP_IT),
        _ => None,
    }
}

#[tauri::command]
pub fn play_sound(name: String, volume: f32, state: State<Mutex<AudioState>>) {
    let audio = state.lock().unwrap();
    if let Some(sender) = &audio.sender {
        let _ = sender.send(AudioCommand { name, volume });
    }
}
