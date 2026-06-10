use std::io::Cursor;
use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

#[derive(Default)]
pub struct TrayState {
    pub tray_icon: Mutex<Option<TrayIcon>>,
}

/// Build the system tray: a menu (Open / Quit) plus left-click to reveal the
/// window. Agent/board status now lives in the Node sidecar, so the tray is a
/// plain launcher — the tooltip is static.
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
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                show_window(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    if let Ok(mut tray_slot) = app.state::<TrayState>().tray_icon.lock() {
        *tray_slot = Some(tray);
    }

    Ok(())
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
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
