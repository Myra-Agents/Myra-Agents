#[cfg(desktop)]
mod tray;

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[cfg(desktop)]
use tray::TrayState;

/// Buffer for a `myra://auth/callback?code=…` that arrives before the webview's
/// listener is ready (the deep link can launch/focus the app first). The
/// frontend drains it via `take_pending_auth_code` on mount.
#[derive(Default)]
struct PendingAuth(Mutex<Option<String>>);

/// Where the hosted web app's desktop login bridge page lives. The desktop
/// opens `<base>/auth/desktop/` in the system browser; the bridge runs Clerk,
/// then deep-links back with a one-time handoff code.
///
/// In `tauri:dev` the bridge is served by the local Next dev server (port 1420),
/// not the production host — so default there unless `MYRA_WEB_APP_URL` overrides.
/// Note: this is the **web app** origin, not the hub Worker (the Worker has no
/// `/auth/desktop/` page).
fn web_app_url() -> String {
    std::env::var("MYRA_WEB_APP_URL").unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            "http://localhost:1420".to_string()
        } else {
            "https://app.myra-agents.ai".to_string()
        }
    })
}

/// Payload emitted to the frontend when a `myra://auth/callback` deep link arrives.
#[derive(Clone, Serialize)]
struct AuthCallback {
    code: String,
}

/// Extract the `code` query param from a `myra://auth/callback?code=…` URL.
fn parse_auth_code(url: &url::Url) -> Option<String> {
    if url.scheme() != "myra" {
        return None;
    }
    url.query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.into_owned())
        .filter(|c| !c.is_empty())
}

/// The stable port the persistent (hub-enrolled) service listens on. When a
/// service is running here we *adopt* it instead of spawning a duplicate writer
/// on `~/.myra-agents`.
const SERVICE_PORT: u16 = 4319;

/// Backs the desktop's "local" connection. Either an ephemeral child sidecar we
/// spawned on a free port (killed on exit) or an *adopted* persistent service on
/// `SERVICE_PORT` (left running — it's meant to outlive the app). `port` and
/// `adopted` change at runtime via `refresh_local_backend`.
struct SidecarState {
    port: Mutex<u16>,
    child: Mutex<Option<CommandChild>>,
    adopted: Mutex<bool>,
}

/// Reserve a free localhost port by binding `:0` and reading the assigned port.
/// The listener is dropped immediately; the small TOCTOU window is fine for a
/// single local sidecar.
fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(SERVICE_PORT)
}

/// Best-effort `GET /healthz` against a localhost port, hand-rolled over TCP to
/// avoid pulling an HTTP client into the backend. True only when a server
/// answers with a 200 — so we adopt a real myra-server, not any random listener.
fn health_ok(port: u16) -> bool {
    let Ok(addr) = format!("127.0.0.1:{port}").parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let req = format!("GET /healthz HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    buf.lines().next().map(|l| l.contains("200")).unwrap_or(false)
}

/// The stable path the self-installed copy of the sidecar lives at, so the OS
/// service points somewhere that survives app moves/updates.
fn stable_bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let name = if cfg!(windows) { "myra-server.exe" } else { "myra-server" };
    Ok(home.join(".myra-agents").join("bin").join(name))
}

/// Update the managed `SidecarState`, or manage it on first call.
fn set_sidecar_state(app: &AppHandle, port: u16, child: Option<CommandChild>, adopted: bool) {
    if let Some(state) = app.try_state::<SidecarState>() {
        *state.port.lock().unwrap() = port;
        *state.child.lock().unwrap() = child;
        *state.adopted.lock().unwrap() = adopted;
    } else {
        app.manage(SidecarState {
            port: Mutex::new(port),
            child: Mutex::new(child),
            adopted: Mutex::new(adopted),
        });
    }
}

/// Resolve the local backend: adopt a persistent service on `SERVICE_PORT` if one
/// is already running, otherwise spawn an ephemeral sidecar on a free port. The
/// adopt branch guarantees a single writer on `~/.myra-agents` (no duplicate
/// process). Returns the resolved port.
fn start_local_backend(app: &AppHandle) -> u16 {
    if health_ok(SERVICE_PORT) {
        set_sidecar_state(app, SERVICE_PORT, None, true);
        return SERVICE_PORT;
    }

    let port = pick_free_port();
    let mut command = app
        .shell()
        // The shell plugin resolves a sidecar relative to the executable's own
        // directory by joining this arg verbatim — and Tauri bundles externalBin
        // flat next to the exe (Contents/MacOS/myra-server, target/<profile>/
        // myra-server), with no `binaries/` subdir. So pass the basename, not the
        // configured externalBin path, or spawn fails with ENOENT on launch.
        .sidecar("myra-server")
        .expect("sidecar myra-server should resolve")
        .env("PORT", port.to_string());
    if let Ok(demo) = std::env::var("DEMO") {
        command = command.env("DEMO", demo);
    }

    match command.spawn() {
        Ok((mut rx, child)) => {
            // Drain the sidecar's stdout/stderr so it never blocks on a full pipe,
            // and surface its logs in the desktop console for debugging.
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
            set_sidecar_state(app, port, Some(child), false);
        }
        Err(e) => {
            eprintln!("[myra-server] spawn failed: {e}");
            set_sidecar_state(app, port, None, false);
        }
    }

    // Wait until the server is actually listening before the UI fans out reads.
    for _ in 0..100 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    port
}

/// Run the bundled sidecar binary to completion, returning its stdout. Used for
/// short subcommands (`status`, `install-self`) where we want the output, not a
/// long-lived child.
async fn run_sidecar(app: &AppHandle, args: Vec<String>, envs: Vec<(String, String)>) -> Result<String, String> {
    let mut command = app.shell().sidecar("myra-server").map_err(|e| e.to_string())?.args(args);
    for (k, v) in envs {
        command = command.env(k, v);
    }
    let output = command.output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Run the stable self-installed copy of the sidecar to completion (blocking).
/// Used for enroll/install-service/unenroll/uninstall-service so the service
/// definition bakes in the stable binary path.
fn run_binary(path: &std::path::Path, args: &[&str], envs: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = StdCommand::new(path);
    cmd.args(args);
    for (k, v) in envs {
        cmd.env(k, v);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Return the port the local sidecar is listening on, so the frontend can point
/// its "local" connection at `http://127.0.0.1:<port>`.
#[tauri::command]
fn get_sidecar_port(state: tauri::State<'_, SidecarState>) -> u16 {
    *state.port.lock().unwrap()
}

/// Re-resolve the local backend (kill any ephemeral child first, then adopt the
/// service or re-spawn). Returns the new port. Called by the frontend after
/// enabling/disabling remote access.
#[tauri::command]
fn refresh_local_backend(app: AppHandle) -> u16 {
    if let Some(state) = app.try_state::<SidecarState>() {
        let adopted = *state.adopted.lock().unwrap();
        if !adopted {
            if let Some(child) = state.child.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    }
    start_local_backend(&app)
}

/// Status of this machine's remote-access enrollment. Mirrors the `status --json`
/// shape emitted by `packages/server/src/main.ts::runStatus`.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteStatus {
    enrolled: bool,
    hub_url: Option<String>,
    user_id: Option<String>,
    instance_id: Option<String>,
    label: Option<String>,
    running: bool,
}

/// Make this computer reachable: copy the sidecar to a stable path, enroll it to
/// the hub with the pairing code, and install the per-user OS service on
/// `SERVICE_PORT`. The frontend then calls `refresh_local_backend` to adopt it.
#[tauri::command]
async fn enable_remote_access(app: AppHandle, hub_url: String, code: String, label: String) -> Result<(), String> {
    let dest = stable_bin_path(&app)?;
    run_sidecar(&app, vec!["install-self".into(), dest.to_string_lossy().to_string()], vec![]).await?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        run_binary(
            &dest,
            &["enroll", &code],
            &[("MYRA_HUB_URL", hub_url.as_str()), ("MYRA_INSTANCE_LABEL", label.as_str())],
        )?;
        run_binary(&dest, &["install-service"], &[("PORT", "4319")])?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stop remote access: remove the OS service and drop the hub credential.
#[tauri::command]
async fn disable_remote_access(app: AppHandle) -> Result<(), String> {
    let dest = stable_bin_path(&app)?;
    if dest.exists() {
        tauri::async_runtime::spawn_blocking(move || {
            let _ = run_binary(&dest, &["uninstall-service"], &[]);
            let _ = run_binary(&dest, &["unenroll"], &[]);
        })
        .await
        .map_err(|e| e.to_string())?;
    } else {
        let _ = run_sidecar(&app, vec!["uninstall-service".into()], vec![]).await;
        let _ = run_sidecar(&app, vec!["unenroll".into()], vec![]).await;
    }
    Ok(())
}

/// Report this machine's enrollment + running state.
#[tauri::command]
async fn remote_access_status(app: AppHandle) -> Result<RemoteStatus, String> {
    let out = run_sidecar(&app, vec!["status".into(), "--json".into()], vec![]).await?;
    let line = out.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    serde_json::from_str(line).map_err(|e| format!("parse status: {e} (output: {out})"))
}

/// Open the system browser at the web app's desktop login bridge. The browser
/// runs Clerk's hosted sign-in (which the Tauri webview can't host), then deep-
/// links a one-time code back to `myra://auth/callback`.
#[tauri::command]
async fn start_login(app: AppHandle) -> Result<(), String> {
    let url = format!("{}/auth/desktop/", web_app_url().trim_end_matches('/'));
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Drain any auth code buffered before the frontend's deep-link listener mounted.
#[tauri::command]
fn take_pending_auth_code(state: tauri::State<'_, PendingAuth>) -> Option<String> {
    state.0.lock().ok().and_then(|mut c| c.take())
}

/// Open the webview's devtools, invoked by the frontend's dev-only "Inspect
/// Element" context-menu item (the native WebKit menu — and its Inspect entry —
/// are suppressed by the frontend). `open_devtools` only exists in debug builds
/// (or with the `devtools` feature), so this is a no-op in release.
#[tauri::command]
fn open_devtools(#[allow(unused_variables)] window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    window.open_devtools();
}

/// Wire the `myra://` deep-link handler: buffer the auth code, notify the
/// frontend, and bring the window forward.
fn setup_deep_link(handle: &AppHandle) {
    use tauri_plugin_deep_link::DeepLinkExt;

    // Linux/Windows: register the scheme at runtime (macOS registers via the
    // Info.plist generated from tauri.conf.json's plugins.deep-link.schemes).
    #[cfg(any(windows, target_os = "linux"))]
    {
        let _ = handle.deep_link().register_all();
    }

    let h = handle.clone();
    handle.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            let Some(code) = parse_auth_code(&url) else {
                continue;
            };
            if let Some(state) = h.try_state::<PendingAuth>() {
                if let Ok(mut slot) = state.0.lock() {
                    *slot = Some(code.clone());
                }
            }
            let _ = h.emit("auth-callback", AuthCallback { code });
            if let Some(win) = h.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(PendingAuth::default());

    #[cfg(desktop)]
    {
        builder = builder.manage(TrayState::default());
    }

    let app = builder
        .setup(|app| {
            #[cfg(desktop)]
            tray::setup_tray(app.handle())?;
            start_local_backend(app.handle());
            setup_deep_link(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide to tray instead of closing
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            refresh_local_backend,
            enable_remote_access,
            disable_remote_access,
            remote_access_status,
            start_login,
            take_pending_auth_code,
            open_devtools
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // Kill the sidecar when the app actually exits (tray "Quit" → Exit) —
        // but never an adopted persistent service; it's meant to outlive the app.
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<SidecarState>() {
                let adopted = *state.adopted.lock().unwrap();
                if !adopted {
                    if let Some(child) = state.child.lock().ok().and_then(|mut c| c.take()) {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
