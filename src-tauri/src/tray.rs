use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use crate::{
    commands::{agent::AgentProcesses, kanban::load_cards},
    models::kanban_card::KanbanStatus,
};

#[derive(Default)]
pub struct TrayState {
    pub tray_icon: Mutex<Option<TrayIcon>>,
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Open Myra Agents", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
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

    update_tray_status(app)?;
    Ok(())
}

pub fn update_tray_status(app: &AppHandle) -> tauri::Result<()> {
    let running_agents = app
        .state::<AgentProcesses>()
        .pids
        .lock()
        .map(|pids| pids.len())
        .unwrap_or_default();

    let attention_cards = load_cards()
        .iter()
        .filter(|card| {
            matches!(
                card.status,
                KanbanStatus::WaitingFeedback | KanbanStatus::AwaitingReview
            )
        })
        .count();

    let mut tooltip = if running_agents > 0 {
        format!("Myra Agents — {running_agents} agent(s) running")
    } else {
        "Myra Agents — Idle".to_string()
    };

    if attention_cards > 0 {
        tooltip.push_str(&format!("\n⚠ {attention_cards} card(s) need attention"));
    }

    if let Ok(tray_slot) = app.state::<TrayState>().tray_icon.lock() {
        if let Some(tray_icon) = tray_slot.as_ref() {
            tray_icon.set_tooltip(Some(tooltip))?;
        }
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
