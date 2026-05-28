use chrono::Local;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::commands::agent::{spawn_agent_for_card, AgentProcesses};
use crate::commands::kanban::{load_cards, save_cards};
use crate::models::kanban_card::KanbanCard;
use crate::models::scheduled_task::{ScheduleKind, ScheduledTask};
use crate::schedule_store::{compute_next_run, load_schedules, save_schedules};

// ─────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateScheduleInput {
    pub name: String,
    pub card_title: String,
    #[serde(default)]
    pub card_description: String,
    pub agent_prompt: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub schedule: ScheduleKind,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateScheduleInput {
    pub id: String,
    pub name: String,
    pub card_title: String,
    #[serde(default)]
    pub card_description: String,
    pub agent_prompt: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub schedule: ScheduleKind,
    pub enabled: bool,
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

fn refresh_next_run(task: &mut ScheduledTask) {
    let now = Local::now();
    task.next_run_at = compute_next_run(task, now).map(|dt| dt.to_rfc3339());
}

fn emit_changed(app: &AppHandle) {
    let _ = app.emit("schedules-updated", ());
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────

#[tauri::command]
pub fn list_schedules(_app: AppHandle) -> Vec<ScheduledTask> {
    load_schedules()
}

#[tauri::command]
pub fn create_schedule(
    app: AppHandle,
    input: CreateScheduleInput,
) -> Result<ScheduledTask, String> {
    let now = Local::now().to_rfc3339();
    let mut task = ScheduledTask {
        id: Uuid::new_v4().to_string()[..8].to_string(),
        name: input.name,
        card_title: input.card_title,
        card_description: input.card_description,
        agent_prompt: input.agent_prompt,
        tags: input.tags,
        schedule: input.schedule,
        enabled: input.enabled,
        created_at: now,
        last_triggered_at: None,
        next_run_at: None,
    };
    refresh_next_run(&mut task);

    let mut schedules = load_schedules();
    schedules.push(task.clone());
    save_schedules(&schedules);
    emit_changed(&app);
    Ok(task)
}

#[tauri::command]
pub fn update_schedule(
    app: AppHandle,
    input: UpdateScheduleInput,
) -> Result<ScheduledTask, String> {
    let mut schedules = load_schedules();
    let idx = schedules
        .iter()
        .position(|s| s.id == input.id)
        .ok_or_else(|| format!("Schedule not found: {}", input.id))?;

    let existing = &mut schedules[idx];
    existing.name = input.name;
    existing.card_title = input.card_title;
    existing.card_description = input.card_description;
    existing.agent_prompt = input.agent_prompt;
    existing.tags = input.tags;
    existing.schedule = input.schedule;
    existing.enabled = input.enabled;
    refresh_next_run(existing);

    let snapshot = existing.clone();
    save_schedules(&schedules);
    emit_changed(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn delete_schedule(app: AppHandle, id: String) -> bool {
    let mut schedules = load_schedules();
    let initial = schedules.len();
    schedules.retain(|s| s.id != id);
    let changed = schedules.len() < initial;
    if changed {
        save_schedules(&schedules);
        emit_changed(&app);
    }
    changed
}

#[tauri::command]
pub fn toggle_schedule_enabled(
    app: AppHandle,
    id: String,
    enabled: bool,
) -> Option<ScheduledTask> {
    let mut schedules = load_schedules();
    let idx = schedules.iter().position(|s| s.id == id)?;
    schedules[idx].enabled = enabled;
    refresh_next_run(&mut schedules[idx]);
    let snapshot = schedules[idx].clone();
    save_schedules(&schedules);
    emit_changed(&app);
    Some(snapshot)
}

/// Force a schedule to fire right now. Creates the card + spawns the agent
/// just like the scheduler loop would, but does not modify `next_run_at`
/// (so the regular cadence keeps going).
#[tauri::command]
pub fn trigger_schedule_now(
    app: AppHandle,
    state: State<'_, AgentProcesses>,
    id: String,
) -> Result<String, String> {
    let schedules = load_schedules();
    let task = schedules
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("Schedule not found: {}", id))?
        .clone();

    let card = materialize_card_for_schedule(&task);
    let card_id = card.id.clone();

    // Persist the new card before spawning the agent (so launch_agent finds it).
    let mut cards = load_cards();
    // Assign end-of-Todo-column position (load_cards has already migrated others).
    let next_pos = cards
        .iter()
        .filter(|c| matches!(c.status, crate::models::kanban_card::KanbanStatus::Todo))
        .map(|c| c.position)
        .fold(0.0_f64, f64::max)
        + 1000.0;
    let mut card = card;
    card.position = next_pos;
    cards.push(card.clone());
    save_cards(&cards);

    // Spawn agent
    let run_id = spawn_agent_for_card(&app, &state, &card_id, None)?;
    let _ = app.emit("agent-result-changed", serde_json::json!({ "card": card }));
    Ok(run_id)
}

/// Build a fresh `KanbanCard` from a schedule. Status is set to `Todo` so the
/// agent-launch logic flips it to `InProgress` immediately.
pub fn materialize_card_for_schedule(task: &ScheduledTask) -> KanbanCard {
    let now = chrono::Utc::now().to_rfc3339();
    let mut tags = task.tags.clone();
    if !tags.iter().any(|t| t == "⏱ scheduled") {
        tags.push("⏱ scheduled".to_string());
    }
    KanbanCard {
        id: Uuid::new_v4().to_string(),
        title: task.card_title.clone(),
        description: task.card_description.clone(),
        status: crate::models::kanban_card::KanbanStatus::Todo,
        created_at: now.clone(),
        updated_at: now,
        agent_prompt: Some(task.agent_prompt.clone()),
        agent_preset_id: None,
        linked_task_id: Some(task.id.clone()),
        tags,
        position: 0.0,
        agent_run_id: None,
        agent_result: None,
        agent_question: None,
        agent_run_started_at: None,
        agent_run_ended_at: None,
        revision_notes: Vec::new(),
        run_history: Vec::new(),
        deleted_at: None,
        previous_status: None,
    }
}

/// Purge done/trashed cards generated by a given schedule. Returns the number
/// removed. Active cards (in_progress, waiting_feedback, awaiting_review) are
/// kept so we never kill a running agent by accident.
#[tauri::command]
pub fn purge_schedule_history(_app: AppHandle, id: String) -> u32 {
    let original = load_cards();
    let mut kept: Vec<KanbanCard> = Vec::new();
    let mut purged: u32 = 0;
    for c in original {
        let from_this = c.linked_task_id.as_deref() == Some(&id);
        let is_active = matches!(
            c.status,
            crate::models::kanban_card::KanbanStatus::InProgress
                | crate::models::kanban_card::KanbanStatus::WaitingFeedback
                | crate::models::kanban_card::KanbanStatus::AwaitingReview
        );
        if from_this && !is_active {
            purged += 1;
        } else {
            kept.push(c);
        }
    }
    save_cards(&kept);
    purged
}
