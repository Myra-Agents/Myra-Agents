use serde::{Deserialize, Serialize};

/// Recurrence rules supported by the Myra Agents scheduler.
///
/// Stored as a discriminated union (`type` tag). The frontend mirror lives in
/// `src/types/schedule.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScheduleKind {
    /// Fires once at the given local date-time, then never again.
    Once {
        /// ISO-8601 local datetime (without TZ suffix), e.g. `2026-05-22T14:30:00`
        at: String,
    },
    /// Every day at the given local time `HH:MM`.
    Daily { time: String },
    /// On selected weekdays at the given local time.
    ///
    /// `days` uses ISO weekday numbers (Mon=1 … Sun=7) to stay
    /// language-agnostic and JSON-friendly.
    Weekly { days: Vec<u8>, time: String },
    /// Repeat every `minutes` starting at `start` (HH:MM local) each day.
    Interval {
        start: String,
        #[serde(rename = "minutes")]
        minutes: u32,
    },
    /// Standard 5- or 6-field cron expression (with seconds optional).
    /// Evaluated in the user's local timezone.
    Cron { expr: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTask {
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

    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_triggered_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<String>,
}
