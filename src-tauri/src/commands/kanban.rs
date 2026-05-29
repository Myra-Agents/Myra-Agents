use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use serde::Deserialize;
use tauri::AppHandle;
use uuid::Uuid;

use crate::models::kanban_card::{KanbanCard, KanbanStatus};

/// Returns true when the app runs in demo mode (`DEMO=1|true`).
/// Demo mode isolates all data under `~/.myra-agents-demo` and prevents the
/// scheduler from spawning real agents.
pub fn demo_mode() -> bool {
    matches!(
        std::env::var("DEMO").ok().as_deref(),
        Some("1" | "true" | "TRUE")
    )
}

/// Returns the Myra Agents data directory: `~/.myra-agents/`
/// (or `~/.myra-agents-demo/` in demo mode). Creates it if it doesn't exist.
pub fn myra_agents_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = home.join(if demo_mode() {
        ".myra-agents-demo"
    } else {
        ".myra-agents"
    });
    fs::create_dir_all(&dir).ok();
    fs::create_dir_all(dir.join("agent-runs")).ok();
    fs::create_dir_all(dir.join("agent-results")).ok();
    dir
}

fn board_path() -> PathBuf {
    myra_agents_dir().join("board.json")
}

pub fn load_cards() -> Vec<KanbanCard> {
    let path = board_path();
    let mut cards: Vec<KanbanCard> = if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    // Migration: assign positions to any card missing one (position == 0.0)
    // by status, preserving insertion order. Saves back if any change.
    let mut changed = false;
    use std::collections::HashMap;
    let mut counters: HashMap<String, f64> = HashMap::new();
    for card in cards.iter_mut() {
        if card.position == 0.0 {
            let key = format!("{:?}", card.status);
            let n = counters.entry(key).or_insert(0.0);
            *n += 1000.0;
            card.position = *n;
            changed = true;
        }
    }
    if changed {
        save_cards(&cards);
    }
    cards
}

/// Returns the next position (end of column) for a given status.
fn next_position_for(cards: &[KanbanCard], status: &KanbanStatus) -> f64 {
    cards
        .iter()
        .filter(|c| &c.status == status)
        .map(|c| c.position)
        .fold(0.0_f64, f64::max)
        + 1000.0
}

pub fn save_cards(cards: &[KanbanCard]) {
    let path = board_path();
    let content = serde_json::to_string_pretty(cards).expect("Failed to serialize cards");
    fs::write(path, content).expect("Failed to write cards");
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────

#[tauri::command]
pub fn get_cards(_app: AppHandle) -> Vec<KanbanCard> {
    load_cards()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCardInput {
    pub title: String,
    pub description: String,
    pub status: KanbanStatus,
    pub agent_prompt: Option<String>,
    pub agent_preset_id: Option<String>,
    pub linked_task_id: Option<String>,
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn add_card(_app: AppHandle, input: CreateCardInput) -> KanbanCard {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    let position = next_position_for(&cards, &input.status);
    let card = KanbanCard {
        id: Uuid::new_v4().to_string(),
        title: input.title,
        description: input.description,
        status: input.status,
        created_at: now.clone(),
        updated_at: now,
        agent_prompt: input.agent_prompt,
        agent_preset_id: input.agent_preset_id,
        linked_task_id: input.linked_task_id,
        tags: input.tags,
        position,
        agent_run_id: None,
        agent_result: None,
        agent_question: None,
        agent_run_started_at: None,
        agent_run_ended_at: None,
        revision_notes: Vec::new(),
        run_history: Vec::new(),
        deleted_at: None,
        previous_status: None,
    };
    cards.push(card.clone());
    save_cards(&cards);
    card
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardInput {
    pub id: String,
    pub title: String,
    pub description: String,
    pub agent_prompt: Option<String>,
    pub agent_preset_id: Option<String>,
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn update_card(_app: AppHandle, input: UpdateCardInput) -> Option<KanbanCard> {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    if let Some(card) = cards.iter_mut().find(|c| c.id == input.id) {
        card.title = input.title;
        card.description = input.description;
        card.agent_prompt = input.agent_prompt;
        card.agent_preset_id = input.agent_preset_id;
        card.tags = input.tags;
        card.updated_at = now;
        let updated = card.clone();
        save_cards(&cards);
        Some(updated)
    } else {
        None
    }
}

#[tauri::command]
pub fn move_card(app: AppHandle, id: String, status: KanbanStatus) -> Option<KanbanCard> {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    // Compute end-of-column position before mutating the target card.
    let new_position = next_position_for(&cards, &status);
    if let Some(card) = cards.iter_mut().find(|c| c.id == id) {
        let changed_column = card.status != status;
        card.status = status;
        if changed_column {
            card.position = new_position;
        }
        card.updated_at = now;
        let updated = card.clone();
        save_cards(&cards);
        let _ = crate::tray::update_tray_status(&app);
        Some(updated)
    } else {
        None
    }
}

/// Reorder a card within its column (or move to a new column at a given position).
/// `new_position` should be derived client-side (e.g., midpoint between neighbors).
#[tauri::command]
pub fn reorder_card(
    _app: AppHandle,
    id: String,
    new_position: f64,
    status: Option<KanbanStatus>,
) -> Option<KanbanCard> {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    let target_status_opt = status.clone();

    let updated = if let Some(card) = cards.iter_mut().find(|c| c.id == id) {
        if let Some(s) = target_status_opt {
            card.status = s;
        }
        card.position = new_position;
        card.updated_at = now;
        Some(card.clone())
    } else {
        None
    };

    if updated.is_some() {
        // Normalize positions in the affected column if any two are too close,
        // to prevent f64 precision collapse over many reorders.
        if let Some(ref u) = updated {
            let need_normalize = {
                let mut sorted: Vec<&KanbanCard> = cards
                    .iter()
                    .filter(|c| c.status == u.status)
                    .collect();
                sorted.sort_by(|a, b| a.position.partial_cmp(&b.position).unwrap_or(std::cmp::Ordering::Equal));
                sorted
                    .windows(2)
                    .any(|w| (w[1].position - w[0].position).abs() < 0.0001)
            };
            if need_normalize {
                let mut indexed: Vec<(String, f64)> = cards
                    .iter()
                    .filter(|c| c.status == u.status)
                    .map(|c| (c.id.clone(), c.position))
                    .collect();
                indexed.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
                for (i, (cid, _)) in indexed.iter().enumerate() {
                    if let Some(c) = cards.iter_mut().find(|c| &c.id == cid) {
                        c.position = ((i + 1) as f64) * 1000.0;
                    }
                }
            }
        }
        save_cards(&cards);
        // Re-fetch the (possibly renormalized) card.
        cards.iter().find(|c| c.id == id).cloned()
    } else {
        None
    }
}

/// Hard delete — removes the card from storage permanently.
#[tauri::command]
pub fn delete_card(_app: AppHandle, id: String) -> bool {
    let mut cards = load_cards();
    let initial_len = cards.len();
    cards.retain(|c| c.id != id);
    if cards.len() < initial_len {
        save_cards(&cards);
        true
    } else {
        false
    }
}

/// Soft delete — moves card to `trashed` status and remembers `previousStatus`.
#[tauri::command]
pub fn trash_card(_app: AppHandle, id: String) -> Option<KanbanCard> {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    if let Some(card) = cards.iter_mut().find(|c| c.id == id) {
        if !matches!(card.status, KanbanStatus::Trashed) {
            card.previous_status = Some(card.status.clone());
        }
        card.status = KanbanStatus::Trashed;
        card.deleted_at = Some(now.clone());
        card.updated_at = now;
        let updated = card.clone();
        save_cards(&cards);
        Some(updated)
    } else {
        None
    }
}

/// Restore — moves a trashed card back to a target status (or `previousStatus`).
#[tauri::command]
pub fn restore_card(
    _app: AppHandle,
    id: String,
    status: Option<KanbanStatus>,
) -> Option<KanbanCard> {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    // Determine target status & end-of-column position before mutating.
    let (target, new_position) = {
        let card_opt = cards.iter().find(|c| c.id == id);
        let target = status
            .or_else(|| card_opt.and_then(|c| c.previous_status.clone()))
            .unwrap_or(KanbanStatus::Todo);
        let pos = next_position_for(&cards, &target);
        (target, pos)
    };
    if let Some(card) = cards.iter_mut().find(|c| c.id == id) {
        card.status = target;
        card.position = new_position;
        card.deleted_at = None;
        card.previous_status = None;
        card.updated_at = now;
        let updated = card.clone();
        save_cards(&cards);
        Some(updated)
    } else {
        None
    }
}

/// Append a revision note (used when "Revoir" is clicked from À vérifier).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionInput {
    pub id: String,
    pub note: String,
}

#[tauri::command]
pub fn add_revision_note(_app: AppHandle, input: RevisionInput) -> Option<KanbanCard> {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    if let Some(card) = cards.iter_mut().find(|c| c.id == input.id) {
        card.revision_notes.push(input.note);
        card.updated_at = now;
        let updated = card.clone();
        save_cards(&cards);
        Some(updated)
    } else {
        None
    }
}

/// Set or clear the answer to an agent's question (waiting_feedback flow).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackInput {
    pub id: String,
    pub answer: String,
}

#[tauri::command]
pub fn answer_feedback(app: AppHandle, input: FeedbackInput) -> Option<KanbanCard> {
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    if let Some(card) = cards.iter_mut().find(|c| c.id == input.id) {
        // Append the answer as a revision note for the next agent run
        card.revision_notes
            .push(format!("Answer to agent question: {}", input.answer));
        card.agent_question = None;
        card.updated_at = now;
        let updated = card.clone();
        save_cards(&cards);
        let _ = crate::tray::update_tray_status(&app);
        Some(updated)
    } else {
        None
    }
}
