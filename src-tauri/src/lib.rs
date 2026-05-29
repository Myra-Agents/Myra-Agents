mod commands;
mod demo;
mod models;
mod schedule_store;
mod scheduler;
mod settings;
mod tray;
mod watcher;

use commands::agent::{cancel_agent, get_run_log, launch_agent, AgentProcesses};
use commands::kanban::{
    add_card, add_revision_note, answer_feedback, delete_card, get_cards, move_card,
    reorder_card, restore_card, trash_card, update_card,
};
use commands::planner::plan_day;
use commands::schedule::{
    create_schedule, delete_schedule, list_schedules, purge_schedule_history,
    toggle_schedule_enabled, trigger_schedule_now, update_schedule,
};
use settings::{get_settings, save_settings};
use tray::TrayState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AgentProcesses::default())
        .manage(TrayState::default())
        .setup(|app| {
            demo::seed_demo_if_needed();
            tray::setup_tray(app.handle())?;
            watcher::spawn_watcher(app.handle().clone());
            scheduler::spawn_scheduler(app.handle().clone());
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
            get_cards,
            add_card,
            update_card,
            move_card,
            reorder_card,
            delete_card,
            trash_card,
            restore_card,
            add_revision_note,
            answer_feedback,
            launch_agent,
            cancel_agent,
            get_run_log,
            list_schedules,
            create_schedule,
            update_schedule,
            delete_schedule,
            toggle_schedule_enabled,
            trigger_schedule_now,
            purge_schedule_history,
            plan_day,
            get_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
