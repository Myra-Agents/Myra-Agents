//! Demo-mode seed data.
//!
//! When the app runs with `DEMO=1`, the data dir is redirected to
//! `~/.myra-agents-demo` (see `commands::kanban::myra_agents_dir`). On first
//! launch we populate it with a full showcase: cards in every Kanban column and
//! one schedule of each kind. Seeding runs only once — if `board.json` already
//! exists the user's demo edits are preserved.

use chrono::Local;

use crate::commands::kanban::{demo_mode, myra_agents_dir, save_cards};
use crate::models::kanban_card::{AgentRun, AgentRunStatus, KanbanCard, KanbanStatus};
use crate::models::scheduled_task::{ScheduleKind, ScheduledTask};
use crate::schedule_store::{compute_next_run, save_schedules};

/// Seed demo data if running in demo mode and the board has never been created.
pub fn seed_demo_if_needed() {
    if !demo_mode() {
        return;
    }
    if myra_agents_dir().join("board.json").exists() {
        return;
    }

    let now = Local::now().to_rfc3339();

    let schedules = demo_schedules(&now);
    save_schedules(&schedules);

    let cards = demo_cards(&now, &schedules);
    save_cards(&cards);

    eprintln!(
        "[demo] seeded {} cards and {} schedules in {:?}",
        cards.len(),
        schedules.len(),
        myra_agents_dir()
    );
}

/// Helper to build a card with sensible defaults; runtime/trash fields stay
/// empty unless overridden by the caller via struct-update syntax.
fn card(
    id: &str,
    title: &str,
    description: &str,
    status: KanbanStatus,
    position: f64,
    tags: &[&str],
    created_at: &str,
) -> KanbanCard {
    KanbanCard {
        id: id.to_string(),
        title: title.to_string(),
        description: description.to_string(),
        status,
        created_at: created_at.to_string(),
        updated_at: created_at.to_string(),
        agent_prompt: None,
        agent_preset_id: None,
        linked_task_id: None,
        tags: tags.iter().map(|t| t.to_string()).collect(),
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
    }
}

fn demo_schedules(now: &str) -> Vec<ScheduledTask> {
    let mut tasks = vec![
        schedule(
            "demo-sch-once",
            "Quarterly report",
            "Generate quarterly report",
            "Generate the quarterly metrics report and summarize key changes.",
            &["report"],
            ScheduleKind::Once {
                at: "2026-06-30T09:00:00".to_string(),
            },
            now,
        ),
        schedule(
            "demo-sch-daily",
            "Morning standup notes",
            "Daily standup digest",
            "Summarize yesterday's merged PRs and open issues for standup.",
            &["daily", "summary"],
            ScheduleKind::Daily {
                time: "09:00".to_string(),
            },
            now,
        ),
        schedule(
            "demo-sch-weekly",
            "Dependency audit",
            "Weekly dependency audit",
            "Check for outdated or vulnerable dependencies and propose upgrades.",
            &["security", "weekly"],
            ScheduleKind::Weekly {
                days: vec![1, 3, 5],
                time: "08:30".to_string(),
            },
            now,
        ),
        schedule(
            "demo-sch-interval",
            "Inbox triage",
            "Triage incoming inbox",
            "Triage new items and label by priority.",
            &["interval"],
            ScheduleKind::Interval {
                start: "08:00".to_string(),
                minutes: 120,
            },
            now,
        ),
        schedule(
            "demo-sch-cron",
            "Nightly backup check",
            "Verify nightly backups",
            "Verify last night's backups completed and report failures.",
            &["cron", "ops"],
            ScheduleKind::Cron {
                expr: "0 9 * * 1-5".to_string(),
            },
            now,
        ),
    ];

    let when = Local::now();
    for task in tasks.iter_mut() {
        task.next_run_at = compute_next_run(task, when).map(|dt| dt.to_rfc3339());
    }

    tasks
}

fn schedule(
    id: &str,
    name: &str,
    card_title: &str,
    agent_prompt: &str,
    tags: &[&str],
    schedule: ScheduleKind,
    created_at: &str,
) -> ScheduledTask {
    ScheduledTask {
        id: id.to_string(),
        name: name.to_string(),
        card_title: card_title.to_string(),
        card_description: String::new(),
        agent_prompt: agent_prompt.to_string(),
        tags: tags.iter().map(|t| t.to_string()).collect(),
        schedule,
        enabled: true,
        created_at: created_at.to_string(),
        last_triggered_at: None,
        next_run_at: None,
    }
}

fn demo_cards(now: &str, schedules: &[ScheduledTask]) -> Vec<KanbanCard> {
    let mut cards = Vec::new();

    // ── Draft ──
    cards.push(card(
        "demo-card-draft-1",
        "Sketch onboarding flow",
        "Rough out the new-user onboarding steps before grooming.",
        KanbanStatus::Draft,
        1000.0,
        &["idea", "ux"],
        now,
    ));
    cards.push(card(
        "demo-card-draft-2",
        "Explore dark-mode palette",
        "Collect color ideas for an alternate theme preset.",
        KanbanStatus::Draft,
        2000.0,
        &["design"],
        now,
    ));

    // ── To Do ── (linked to the daily schedule)
    let mut todo = card(
        "demo-card-todo-1",
        "Write release notes for v0.4",
        "Draft user-facing release notes covering the demo-mode work.",
        KanbanStatus::Todo,
        1000.0,
        &["docs"],
        now,
    );
    todo.agent_prompt = Some("Draft release notes for v0.4 from the merged PRs.".to_string());
    todo.agent_preset_id = Some("claude".to_string());
    todo.linked_task_id = schedules
        .iter()
        .find(|s| s.id == "demo-sch-daily")
        .map(|s| s.id.clone());
    cards.push(todo);

    // ── In Progress ── (live agent run)
    let mut in_progress = card(
        "demo-card-inprogress-1",
        "Refactor scheduler tick loop",
        "Split the tick loop into smaller testable functions.",
        KanbanStatus::InProgress,
        1000.0,
        &["backend", "refactor"],
        now,
    );
    in_progress.agent_prompt =
        Some("Refactor scheduler::tick into smaller functions with tests.".to_string());
    in_progress.agent_preset_id = Some("opencode".to_string());
    in_progress.agent_run_id = Some("demo-run-inprogress".to_string());
    in_progress.agent_run_started_at = Some(now.to_string());
    in_progress.run_history = vec![AgentRun {
        id: "demo-run-inprogress".to_string(),
        started_at: now.to_string(),
        ended_at: None,
        prompt: "Refactor scheduler::tick into smaller functions with tests.".to_string(),
        result: None,
        status: AgentRunStatus::Running,
        exit_code: None,
    }];
    cards.push(in_progress);

    // ── Waiting Feedback ── (agent asked a question)
    let mut feedback = card(
        "demo-card-feedback-1",
        "Add CSV export to logs",
        "Export run logs to CSV from the logs page.",
        KanbanStatus::WaitingFeedback,
        1000.0,
        &["feature"],
        now,
    );
    feedback.agent_prompt = Some("Add a CSV export button to the logs page.".to_string());
    feedback.agent_question = Some(
        "Should the export include trashed/orphaned runs, or only completed ones?".to_string(),
    );
    cards.push(feedback);

    // ── Awaiting Review ── (agent produced a result + revision notes)
    let mut review = card(
        "demo-card-review-1",
        "Tune sidebar collapse animation",
        "Smooth the sidebar collapse/expand transition.",
        KanbanStatus::AwaitingReview,
        1000.0,
        &["ui"],
        now,
    );
    review.agent_prompt =
        Some("Improve the sidebar collapse animation timing and easing.".to_string());
    review.agent_result = Some(
        "Updated the transition to 180ms ease-out and removed the layout jump on collapse. \
         Changed `sidebar.tsx` and the related CSS variables."
            .to_string(),
    );
    review.agent_run_ended_at = Some(now.to_string());
    review.revision_notes = vec![
        "Prefer ease-out over linear for the width transition.".to_string(),
        "Keep the icon fade in sync with the width change.".to_string(),
    ];
    review.run_history = vec![AgentRun {
        id: "demo-run-review".to_string(),
        started_at: now.to_string(),
        ended_at: Some(now.to_string()),
        prompt: "Improve the sidebar collapse animation timing and easing.".to_string(),
        result: Some("Updated transition to 180ms ease-out.".to_string()),
        status: AgentRunStatus::AwaitingReview,
        exit_code: Some(0),
    }];
    cards.push(review);

    // ── Done ── (completed run)
    let mut done = card(
        "demo-card-done-1",
        "Add theme presets",
        "Add Caffeine, Claude, and Supabase theme presets.",
        KanbanStatus::Done,
        1000.0,
        &["ui", "themes"],
        now,
    );
    done.agent_prompt = Some("Add three new theme presets to the app.".to_string());
    done.agent_result = Some("Added caffeine, claude, and supabase presets.".to_string());
    done.agent_run_ended_at = Some(now.to_string());
    done.run_history = vec![AgentRun {
        id: "demo-run-done".to_string(),
        started_at: now.to_string(),
        ended_at: Some(now.to_string()),
        prompt: "Add three new theme presets to the app.".to_string(),
        result: Some("Added caffeine, claude, and supabase presets.".to_string()),
        status: AgentRunStatus::Completed,
        exit_code: Some(0),
    }];
    cards.push(done);

    // ── Trashed ── (soft-deleted, restorable to its previous column)
    let mut trashed = card(
        "demo-card-trashed-1",
        "Prototype voice commands",
        "Abandoned spike on voice control.",
        KanbanStatus::Trashed,
        1000.0,
        &["spike"],
        now,
    );
    trashed.deleted_at = Some(now.to_string());
    trashed.previous_status = Some(KanbanStatus::Draft);
    cards.push(trashed);

    cards
}
