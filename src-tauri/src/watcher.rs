use std::path::PathBuf;
use std::time::Duration;

use chrono::Utc;
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::kanban::{load_cards, save_cards, myra_agents_dir};
use crate::models::kanban_card::{AgentRunStatus, KanbanCard, KanbanStatus};

/// Payload written by opencode to `~/.myra-agents/agent-results/{cardId}.json`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentResultFile {
    #[serde(rename = "cardId")]
    card_id: String,
    status: String, // "awaiting_review" | "waiting_feedback" | "failed"
    #[serde(default)]
    result: Option<String>,
    #[serde(default)]
    question: Option<String>,
    #[serde(default)]
    error: Option<String>,
    /// Optional token usage reported by the agent.
    #[serde(default)]
    tokens: Option<i64>,
    /// Optional cost in USD reported by the agent.
    #[serde(default)]
    cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentResultEvent {
    card: KanbanCard,
}

/// Spawn the filesystem watcher. Runs for the lifetime of the application.
/// Emits `agent-result-changed` Tauri events whenever a result file appears.
pub fn spawn_watcher(app: AppHandle) {
    let results_dir: PathBuf = myra_agents_dir().join("agent-results");
    let app_handle = app.clone();

    std::thread::spawn(move || {
        // Debounce by 300ms to avoid double-fires from atomic writes
        let (tx, rx) = std::sync::mpsc::channel();
        let mut debouncer = match new_debouncer(Duration::from_millis(300), None, tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[watcher] Failed to create debouncer: {e}");
                return;
            }
        };

        if let Err(e) = debouncer
            .watcher()
            .watch(&results_dir, RecursiveMode::NonRecursive)
        {
            eprintln!("[watcher] Failed to watch {results_dir:?}: {e}");
            return;
        }

        // Keep the debouncer alive
        let _keep_alive = debouncer;

        for events in rx {
            let Ok(events) = events else { continue };
            for event in events {
                for path in &event.paths {
                    if path.extension().and_then(|s| s.to_str()) != Some("json") {
                        continue;
                    }
                    handle_result_file(&app_handle, path);
                }
            }
        }
    });
}

fn handle_result_file(app: &AppHandle, path: &std::path::Path) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return, // file might have been removed mid-read
    };

    let parsed: AgentResultFile = match serde_json::from_str(&content) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[watcher] Failed to parse {path:?}: {e}");
            return;
        }
    };

    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();

    let card = match cards.iter_mut().find(|c| c.id == parsed.card_id) {
        Some(c) => c,
        None => {
            eprintln!("[watcher] Unknown cardId: {}", parsed.card_id);
            return;
        }
    };

    // Update agent run record
    if let Some(run_id) = card.agent_run_id.clone() {
        if let Some(run) = card.run_history.iter_mut().find(|r| r.id == run_id) {
            run.ended_at = Some(now.clone());
            run.result = parsed.result.clone().or_else(|| parsed.question.clone());
            run.tokens = parsed.tokens;
            run.cost = parsed.cost;
            run.status = match parsed.status.as_str() {
                "awaiting_review" => AgentRunStatus::AwaitingReview,
                "waiting_feedback" => AgentRunStatus::NeedsFeedback,
                "failed" => AgentRunStatus::Failed,
                _ => AgentRunStatus::Completed,
            };
        }
    }

    match parsed.status.as_str() {
        "awaiting_review" => {
            card.status = KanbanStatus::AwaitingReview;
            card.agent_result = parsed.result.clone();
            card.agent_question = None;
        }
        "waiting_feedback" => {
            card.status = KanbanStatus::WaitingFeedback;
            card.agent_question = parsed.question.clone();
            card.agent_result = parsed.result.clone();
        }
        "failed" => {
            // Leave in_progress visually demoted: park back in todo with error in result
            card.status = KanbanStatus::Todo;
            card.agent_result = parsed.error.clone().or(parsed.result.clone());
            card.agent_question = None;
        }
        _ => {
            // Unknown status — treat as awaiting review
            card.status = KanbanStatus::AwaitingReview;
            card.agent_result = parsed.result.clone();
        }
    }

    card.agent_run_ended_at = Some(now.clone());
    card.agent_run_id = None;
    card.updated_at = now;
    let updated = card.clone();
    save_cards(&cards);
    let _ = crate::tray::update_tray_status(app);

    // Archive the result file so the next run starts fresh
    let archive_dir = myra_agents_dir().join("agent-runs");
    if let Some(fname) = path.file_name() {
        let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S");
        let archived = archive_dir.join(format!("{}-{}", stamp, fname.to_string_lossy()));
        let _ = std::fs::rename(path, &archived);
    }

    // Emit event to frontend
    let event_payload = AgentResultEvent { card: updated };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("agent-result-changed", &event_payload);
    } else {
        let _ = app.emit("agent-result-changed", &event_payload);
    }
}
