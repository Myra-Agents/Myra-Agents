use std::time::Duration as StdDuration;

use chrono::Local;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::agent::{request_launch, AgentProcesses};
use crate::commands::kanban::{load_cards, save_cards};
use crate::commands::schedule::materialize_card_for_schedule;
use crate::schedule_store::{compute_next_run, load_schedules, save_schedules};

/// Polling interval for the scheduler. Schedules are checked every tick.
const TICK_SECONDS: u64 = 30;

/// Spawn the background scheduler. Runs on the Tauri tokio runtime.
pub fn spawn_scheduler(app: AppHandle) {
    // Run one tick immediately on startup, then loop.
    tauri::async_runtime::spawn(async move {
        // Tiny initial delay so the UI has time to subscribe to events.
        tokio::time::sleep(StdDuration::from_secs(2)).await;
        loop {
            if let Err(e) = tick(&app).await {
                eprintln!("[scheduler] tick failed: {e}");
            }
            tokio::time::sleep(StdDuration::from_secs(TICK_SECONDS)).await;
        }
    });
}

/// One iteration: check every enabled schedule, fire the ones whose
/// `next_run_at` is in the past, then recompute `next_run_at`.
async fn tick(app: &AppHandle) -> Result<(), String> {
    let now = Local::now();
    let mut schedules = load_schedules();
    let mut any_changed = false;
    let mut fired_any = false;

    for task in schedules.iter_mut() {
        // Recompute next_run_at if missing (e.g. just toggled enabled).
        if task.next_run_at.is_none() {
            task.next_run_at = compute_next_run(task, now).map(|dt| dt.to_rfc3339());
            any_changed = true;
        }

        if !task.enabled {
            continue;
        }

        let due = task
            .next_run_at
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Local))
            .map(|dt| dt <= now)
            .unwrap_or(false);

        if !due {
            continue;
        }

        // Demo mode: keep next_run_at populated for the UI, but never spawn a
        // real agent or auto-create cards.
        if crate::commands::kanban::demo_mode() {
            task.last_triggered_at = Some(now.to_rfc3339());
            task.next_run_at = compute_next_run(task, now).map(|dt| dt.to_rfc3339());
            any_changed = true;
            continue;
        }

        // Materialize a card + spawn the agent.
        let card = materialize_card_for_schedule(task);
        let card_id = card.id.clone();

        let mut cards = load_cards();
        cards.push(card.clone());
        save_cards(&cards);

        // Spawn the agent. If it fails, log and move on — the schedule still
        // advances so we don't loop on a broken card forever.
        let state = app.state::<AgentProcesses>();
        match request_launch(app, &state, &card_id, None) {
            Ok(result) => {
                eprintln!(
                    "[scheduler] fired schedule {} → card {} ({})",
                    task.id,
                    card_id,
                    result
                        .run_id
                        .clone()
                        .map(|r| format!("run {r}"))
                        .unwrap_or_else(|| "queued".to_string())
                );
                // Notify frontend the new card exists
                let _ = app.emit(
                    "agent-result-changed",
                    serde_json::json!({ "card": card }),
                );
                fired_any = true;
            }
            Err(e) => {
                eprintln!(
                    "[scheduler] failed to spawn agent for schedule {}: {}",
                    task.id, e
                );
            }
        }

        task.last_triggered_at = Some(now.to_rfc3339());
        task.next_run_at = compute_next_run(task, now).map(|dt| dt.to_rfc3339());
        any_changed = true;
    }

    if any_changed {
        save_schedules(&schedules);
        let _ = app.emit("schedules-updated", ());
    }

    let _ = fired_any;
    Ok(())
}
