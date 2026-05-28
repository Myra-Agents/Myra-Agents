use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KanbanStatus {
    Draft,
    Todo,
    InProgress,
    WaitingFeedback,
    AwaitingReview,
    Done,
    Trashed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunStatus {
    Running,
    NeedsFeedback,
    AwaitingReview,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    pub status: AgentRunStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanCard {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: KanbanStatus,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_preset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_task_id: Option<String>,
    pub tags: Vec<String>,

    /// Ordering position within the card's column. Lower = higher in the column.
    /// Uses f64 so we can insert between two cards by averaging their positions
    /// without re-writing the whole column.
    #[serde(default)]
    pub position: f64,

    // ── Agent runtime state ──
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_question: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_run_started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_run_ended_at: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub revision_notes: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub run_history: Vec<AgentRun>,

    // ── Trash state ──
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_status: Option<KanbanStatus>,
}
