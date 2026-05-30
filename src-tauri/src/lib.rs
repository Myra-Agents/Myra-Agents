mod tray;

use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

use tray::TrayState;

/// The Node sidecar (the `@myra/server` Bun binary) that backs the desktop's
/// "local" connection. We pick a free port, spawn the binary on it, wait for it
/// to accept connections, then hand the port to the frontend via
/// `get_sidecar_port`. The child is killed on app exit.
struct SidecarState {
    port: u16,
    child: Mutex<Option<CommandChild>>,
}

/// Reserve a free localhost port by binding `:0` and reading the assigned port.
/// The listener is dropped immediately; the small TOCTOU window is fine for a
/// single local sidecar.
fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(4319)
}

/// Spawn the bundled sidecar binary on a free port and block until it accepts
/// TCP (or a ~5s timeout). Stores the port + child handle in managed state.
fn spawn_sidecar(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let port = pick_free_port();

    let mut command = app
        .handle()
        .shell()
        .sidecar("binaries/myra-server")?
        .env("PORT", port.to_string());
    if let Ok(demo) = std::env::var("DEMO") {
        command = command.env("DEMO", demo);
    }

    let (mut rx, child) = command.spawn()?;

    // Drain the sidecar's stdout/stderr so it never blocks on a full pipe, and
    // surface its logs in the desktop console for debugging.
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    print!("[myra-server] {}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[myra-server] terminated: {:?}", payload.code);
                }
                _ => {}
            }
        }
    });

    // Wait until the server is actually listening before the UI fans out reads.
    for _ in 0..100 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    app.manage(SidecarState {
        port,
        child: Mutex::new(Some(child)),
    });
    Ok(())
}

/// Return the port the local sidecar is listening on, so the frontend can point
/// its "local" connection at `http://127.0.0.1:<port>`.
#[tauri::command]
fn get_sidecar_port(state: tauri::State<'_, SidecarState>) -> u16 {
    state.port
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(TrayState::default())
        .setup(|app| {
            tray::setup_tray(app.handle())?;
            spawn_sidecar(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide to tray instead of closing
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![get_sidecar_port])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // Kill the sidecar when the app actually exits (tray "Quit" → Exit).
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<SidecarState>() {
                if let Some(child) = state.child.lock().ok().and_then(|mut c| c.take()) {
                    let _ = child.kill();
                }
            }
        }
    });
}
