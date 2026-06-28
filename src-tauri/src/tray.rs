use std::io::Cursor;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Rect, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

/// Label of the borderless popover webview anchored under the tray icon. It
/// loads the Next `/tray` route — a compact dashboard (attention, running
/// agents, 14-day stats, quick actions) that reads the same connection registry
/// as the main window (localStorage is shared per-origin).
const POPOVER_LABEL: &str = "tray";

/// Logical size of the popover. Height is generous; the panel content sits at
/// the top and the transparent remainder is click-through-dismissed anyway.
const POPOVER_W: f64 = 360.0;
const POPOVER_H: f64 = 560.0;

#[derive(Default)]
pub struct TrayState {
    pub tray_icon: Mutex<Option<TrayIcon>>,
    /// When the popover was last hidden. Guards the reopen-on-close race: a
    /// left-click while the popover is focused fires `Focused(false)` (which
    /// hides it) *before* the tray click handler runs, so without this the
    /// click that should close it would immediately reopen it.
    last_dismiss: Mutex<Option<Instant>>,
}

impl TrayState {
    /// True if the popover was dismissed within `dur`. Lets the macOS reopen
    /// handler tell a tray-click-driven reopen (which would resurrect the
    /// hidden main window) apart from a genuine Dock-icon reopen.
    pub fn dismissed_within(&self, dur: Duration) -> bool {
        self.last_dismiss.lock().ok().and_then(|g| *g).map(|t| t.elapsed() < dur).unwrap_or(false)
    }
}

/// Payload for `tray-navigate`, consumed by the main window's listener to route
/// and (optionally) trigger the new-task flow.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayNavigate {
    pub path: String,
    pub new_task: bool,
    pub new_schedule: bool,
}

/// Build the system tray: left-click toggles the popover, right-click opens a
/// minimal native menu (Open / Quit) as a fallback. The tooltip is static.
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Open Myra Agents", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = load_png_icon(include_bytes!("../../media/logo/logo-dark.png"))
        .unwrap_or_else(|| app.default_window_icon().unwrap().clone());

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Myra Agents")
        .menu(&menu)
        // Left-click is ours (toggles the popover); the menu is right-click only.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                toggle_popover(tray.app_handle(), rect);
            }
        })
        .build(app)?;

    if let Ok(mut tray_slot) = app.state::<TrayState>().tray_icon.lock() {
        *tray_slot = Some(tray);
    }

    Ok(())
}

/// Reveal + focus the main window.
fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Get the popover window, creating it (hidden) on first use. The webview is
/// borderless + transparent (CSS draws the rounded card) and dismisses itself
/// when it loses focus, like a native menu-bar popover.
fn get_or_create_popover(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(win) = app.get_webview_window(POPOVER_LABEL) {
        return Ok(win);
    }

    let win = WebviewWindowBuilder::new(app, POPOVER_LABEL, WebviewUrl::App("tray/".into()))
        .title("Myra")
        .inner_size(POPOVER_W, POPOVER_H)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .visible(false)
        .focused(false)
        .build()?;

    let dismiss = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            if let Some(state) = dismiss.app_handle().try_state::<TrayState>() {
                if let Ok(mut slot) = state.last_dismiss.lock() {
                    *slot = Some(Instant::now());
                }
            }
            let _ = dismiss.hide();
        }
    });

    Ok(win)
}

/// Toggle the popover, anchoring it under the tray icon on open.
fn toggle_popover(app: &AppHandle, rect: Rect) {
    let win = match get_or_create_popover(app) {
        Ok(w) => w,
        Err(e) => {
            log::error!(target: "tray", "popover create failed: {e}");
            return;
        }
    };

    let visible = win.is_visible().unwrap_or(false);
    if visible {
        let _ = win.hide();
        if let Some(state) = app.try_state::<TrayState>() {
            if let Ok(mut slot) = state.last_dismiss.lock() {
                *slot = Some(Instant::now());
            }
        }
        return;
    }

    // A click that just dismissed the popover via blur shouldn't reopen it.
    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut slot) = state.last_dismiss.lock() {
            if slot.map(|t| t.elapsed() < Duration::from_millis(250)).unwrap_or(false) {
                *slot = None;
                return;
            }
        }
    }

    position_popover(&win, rect);
    let _ = win.show();
    let _ = win.set_focus();
}

/// Anchor the popover to the tray icon: centered horizontally under it, dropped
/// below the menu bar (macOS) or lifted above the taskbar (icon in the lower
/// half of its monitor — Windows). Clamped to the monitor that holds the icon.
fn position_popover(win: &WebviewWindow, rect: Rect) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let icon_pos = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);

    let win_w = POPOVER_W * scale;
    let win_h = POPOVER_H * scale;
    let gap = 6.0 * scale;

    let icon_cx = icon_pos.x + icon_size.width / 2.0;
    let mut x = icon_cx - win_w / 2.0;

    // Find the monitor containing the icon (fall back to the window's current /
    // primary monitor). Clamp X into it, and decide above/below by which half
    // of the monitor the icon sits in.
    let monitor = win
        .available_monitors()
        .ok()
        .and_then(|ms| {
            ms.into_iter().find(|m| {
                let mp = m.position();
                let ms = m.size();
                icon_cx >= mp.x as f64
                    && icon_cx <= (mp.x as f64 + ms.width as f64)
                    && icon_pos.y >= mp.y as f64
                    && icon_pos.y <= (mp.y as f64 + ms.height as f64)
            })
        })
        .or_else(|| win.current_monitor().ok().flatten())
        .or_else(|| win.primary_monitor().ok().flatten());

    let mut y = icon_pos.y + icon_size.height + gap;
    if let Some(m) = monitor {
        let mp = m.position();
        let msz = m.size();
        let min_x = mp.x as f64 + 8.0 * scale;
        let max_x = mp.x as f64 + msz.width as f64 - win_w - 8.0 * scale;
        if max_x >= min_x {
            x = x.clamp(min_x, max_x);
        }
        // Icon in the lower half → tray is at the bottom; open upward.
        let mon_mid_y = mp.y as f64 + msz.height as f64 / 2.0;
        if icon_pos.y > mon_mid_y {
            y = icon_pos.y - win_h - gap;
        }
    }

    let _ = win.set_position(tauri::PhysicalPosition::new(x.round(), y.round()));
}

/// Hide the popover (called by the tray UI before navigating, or on Esc).
#[tauri::command]
pub fn hide_tray_popover(app: AppHandle) {
    if let Some(w) = app.get_webview_window(POPOVER_LABEL) {
        let _ = w.hide();
    }
}

/// Reveal the main window, route it to `path`, and (optionally) trigger the
/// new-task flow. The popover dismisses itself. Navigation + the zustand
/// new-task request happen in the main webview via the `tray-navigate` event.
#[tauri::command]
pub fn open_main(app: AppHandle, path: String, new_task: bool) {
    show_window(&app);
    let _ = app.emit("tray-navigate", TrayNavigate { path, new_task, new_schedule: false });
    if let Some(w) = app.get_webview_window(POPOVER_LABEL) {
        let _ = w.hide();
    }
}

/// Quit the whole app from the popover (tears down the sidecar via `RunEvent::Exit`).
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn load_png_icon(bytes: &[u8]) -> Option<Image<'static>> {
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            let rgb = &buf[..info.buffer_size()];
            rgb.chunks_exact(3)
                .flat_map(|p| [p[0], p[1], p[2], 255])
                .collect()
        }
        _ => return None,
    };
    Some(Image::new_owned(rgba, info.width, info.height))
}
