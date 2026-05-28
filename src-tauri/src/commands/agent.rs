use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::commands::kanban::{load_cards, save_cards, myra_agents_dir};
use crate::models::kanban_card::{AgentRun, AgentRunStatus, KanbanStatus};
use crate::settings::resolve_agent_preset;

/// Per-card spawned process tracking. We keep the PID so we can kill it
/// (the actual `Child` is owned by the streaming thread).
#[derive(Default)]
pub struct AgentProcesses {
    pub pids: Mutex<HashMap<String, u32>>,
}

/// Payload emitted whenever a new log line is appended.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentLogEvent {
    card_id: String,
    run_id: String,
    line: String,
}

fn quote_windows_arg(arg: &str) -> String {
    if arg.is_empty() {
        return "\"\"".to_string();
    }

    let needs_quotes = arg.chars().any(|ch| ch.is_whitespace() || ch == '"');
    if !needs_quotes {
        return arg.to_string();
    }

    let mut quoted = String::from("\"");
    let mut backslashes = 0usize;
    for ch in arg.chars() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                quoted.push_str(&"\\".repeat(backslashes * 2 + 1));
                quoted.push('"');
                backslashes = 0;
            }
            _ => {
                quoted.push_str(&"\\".repeat(backslashes));
                quoted.push(ch);
                backslashes = 0;
            }
        }
    }
    quoted.push_str(&"\\".repeat(backslashes * 2));
    quoted.push('"');
    quoted
}

fn split_command_line(input: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();
    let mut in_quotes = false;
    let mut backslashes = 0usize;
    let mut had_token = false;

    while let Some(ch) = chars.next() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                had_token = true;
                current.push_str(&"\\".repeat(backslashes / 2));
                if backslashes % 2 == 0 {
                    if in_quotes && chars.peek() == Some(&'"') {
                        current.push('"');
                        let _ = chars.next();
                    } else {
                        in_quotes = !in_quotes;
                    }
                } else {
                    current.push('"');
                }
                backslashes = 0;
            }
            c if c.is_whitespace() && !in_quotes => {
                current.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
                if had_token || !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                    had_token = false;
                }
            }
            c => {
                current.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
                current.push(c);
                had_token = true;
            }
        }
    }

    if in_quotes {
        return Err("Invalid args_template: unmatched quote".to_string());
    }

    current.push_str(&"\\".repeat(backslashes));
    if had_token || !current.is_empty() {
        args.push(current);
    }
    Ok(args)
}

fn build_agent_command(binary: &str, args_template: &str, prompt: &str) -> Result<Command, String> {
    let binary = binary.trim();
    if binary.is_empty() {
        return Err("Agent binary cannot be empty".to_string());
    }
    if !args_template.contains("{prompt}") {
        return Err(format!(
            "Agent preset `{}` must include {{prompt}} in args_template",
            binary
        ));
    }

    let rendered = args_template.replace("{prompt}", &quote_windows_arg(prompt));
    let args = split_command_line(&rendered)?;

    let mut cmd = Command::new(binary);
    cmd.args(args);
    Ok(cmd)
}

/// Build the prompt: revision notes prepended, original task, then the
/// JSON-result protocol footer.
fn build_prompt(
    base: &str,
    revision_notes: &[String],
    card_id: &str,
    result_path: &str,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    if !revision_notes.is_empty() {
        parts.push("## Revision instructions (most recent first)\n".to_string());
        for (i, note) in revision_notes.iter().rev().enumerate() {
            parts.push(format!("{}. {}", i + 1, note));
        }
        parts.push(String::new());
        parts.push("## Original task\n".to_string());
    }

    parts.push(base.trim().to_string());

    parts.push(String::new());
    parts.push("---".to_string());
    parts.push(format!(
        "## Myra Agents agent protocol\n\
When you have completed the task, write a JSON file to:\n\
  {result_path}\n\
\n\
The file must contain one of these shapes:\n\
\n\
  {{\"cardId\": \"{card_id}\", \"status\": \"awaiting_review\", \"result\": \"<summary>\"}}\n\
  {{\"cardId\": \"{card_id}\", \"status\": \"waiting_feedback\", \"question\": \"<your question>\"}}\n\
  {{\"cardId\": \"{card_id}\", \"status\": \"failed\", \"error\": \"<reason>\"}}\n\
\n\
After writing the file, you may exit. Myra Agents is watching this path."
    ));

    parts.join("\n")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAgentInput {
    pub card_id: String,
    pub working_dir: Option<String>,
}

/// Spawn the configured agent preset in headless mode, capturing stdout/stderr.
/// Each line is appended to `~/.myra-agents/agent-runs/{runId}.log` and emitted
/// as an `agent-log-appended` Tauri event.
#[tauri::command]
pub fn launch_agent(
    app: AppHandle,
    state: State<'_, AgentProcesses>,
    input: LaunchAgentInput,
) -> Result<String, String> {
    spawn_agent_for_card(&app, &state, &input.card_id, input.working_dir.as_deref())
}

/// Internal entry point — same logic as `launch_agent` but callable from
/// other Rust code (e.g. the scheduler). Returns the new `run_id`.
pub fn spawn_agent_for_card(
    app: &AppHandle,
    state: &AgentProcesses,
    card_id: &str,
    working_dir: Option<&str>,
) -> Result<String, String> {
    let mut cards = load_cards();
    let card = cards
        .iter_mut()
        .find(|c| c.id == card_id)
        .ok_or_else(|| format!("Card not found: {}", card_id))?;

    let base_prompt = card.agent_prompt.clone().unwrap_or_else(|| {
        if card.description.is_empty() {
            card.title.clone()
        } else {
            format!("{}\n\n{}", card.title, card.description)
        }
    });

    let dir = myra_agents_dir();
    let result_file = dir.join("agent-results").join(format!("{}.json", card.id));
    let _ = std::fs::remove_file(&result_file);
    let result_path_str = result_file.to_string_lossy().replace('\\', "/");

    let full_prompt = build_prompt(
        &base_prompt,
        &card.revision_notes,
        &card.id,
        &result_path_str,
    );

    let preset = resolve_agent_preset(card.agent_preset_id.as_deref())?;
    let working_dir = working_dir
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            preset
                .working_dir
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_else(|| {
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".to_string())
        });

    let run_id = Uuid::new_v4().to_string();
    let log_path: PathBuf = dir.join("agent-runs").join(format!("{run_id}.log"));

    // Truncate / create the log file
    if let Err(e) = std::fs::write(&log_path, "") {
        return Err(format!("Failed to create log file {log_path:?}: {e}"));
    }

    let agent_label = format!("{} ({})", preset.name, preset.binary);
    let mut cmd = build_agent_command(&preset.binary, &preset.args_template, &full_prompt)?;
    cmd.current_dir(&working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {}: {e}", preset.binary))?;

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Track PID for cancellation
    state
        .pids
        .lock()
        .map_err(|e| format!("PID lock poisoned: {e}"))?
        .insert(card.id.clone(), pid);

    // Spawn reader threads — one for stdout, one for stderr.
    // Both append to the same log file and emit the same event so the UI
    // sees a unified stream.
    spawn_log_reader(
        app.clone(),
        card.id.clone(),
        run_id.clone(),
        log_path.clone(),
        stdout,
        "OUT",
    );
    spawn_log_reader(
        app.clone(),
        card.id.clone(),
        run_id.clone(),
        log_path.clone(),
        stderr,
        "ERR",
    );

    // Spawn a waiter thread that releases the PID once the child exits.
    {
        let card_id = card.id.clone();
        let run_id_for_wait = run_id.clone();
        let log_path_for_wait = log_path.clone();
        let app_for_wait = app.clone();
        let agent_label_for_wait = agent_label.clone();
        let pids_arc = state.pids.lock().is_ok(); // sanity
        let _ = pids_arc;
        // Move just the state we need (cloned AppHandle is enough; we re-lock pids).
        std::thread::spawn(move || {
            let exit_status = child.wait();
            let exit_code = exit_status.ok().and_then(|s| s.code());

            // Append a final marker line
            let footer = format!(
                "\n[myra-agents] {} exited with code {}\n",
                agent_label_for_wait,
                exit_code.map(|c| c.to_string()).unwrap_or_else(|| "?".into())
            );
            let _ = OpenOptions::new()
                .append(true)
                .open(&log_path_for_wait)
                .and_then(|mut f| f.write_all(footer.as_bytes()));

            // Emit a final event so the UI knows the stream ended
            let _ = app_for_wait.emit(
                "agent-log-appended",
                AgentLogEvent {
                    card_id: card_id.clone(),
                    run_id: run_id_for_wait,
                    line: footer.trim_end().to_string(),
                },
            );

            // Release the PID slot
            if let Ok(mut pids) = app_for_wait.state::<AgentProcesses>().pids.lock() {
                pids.remove(&card_id);
            }
            let _ = crate::tray::update_tray_status(&app_for_wait);
        });
    }

    // Update the card
    let now = Utc::now().to_rfc3339();
    card.status = KanbanStatus::InProgress;
    card.agent_preset_id = Some(preset.id.clone());
    card.agent_run_id = Some(run_id.clone());
    card.agent_run_started_at = Some(now.clone());
    card.agent_run_ended_at = None;
    card.agent_result = None;
    card.agent_question = None;
    card.updated_at = now.clone();
    card.run_history.push(AgentRun {
        id: run_id.clone(),
        started_at: now,
        ended_at: None,
        prompt: full_prompt.clone(),
        result: None,
        status: AgentRunStatus::Running,
        exit_code: None,
    });

    save_cards(&cards);
    let _ = crate::tray::update_tray_status(app);
    Ok(run_id)
}

/// Spawn a thread that reads `pipe` line-by-line, appends each line to the
/// log file, and emits an `agent-log-appended` event.
fn spawn_log_reader<R>(
    app: AppHandle,
    card_id: String,
    run_id: String,
    log_path: PathBuf,
    pipe: Option<R>,
    tag: &'static str,
) where
    R: std::io::Read + Send + 'static,
{
    let Some(pipe) = pipe else { return };
    std::thread::spawn(move || {
        let reader = BufReader::new(pipe);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let prefixed = if tag == "ERR" {
                format!("[err] {line}\n")
            } else {
                format!("{line}\n")
            };

            // Append to log file (best effort)
            if let Ok(mut f) = OpenOptions::new().append(true).open(&log_path) {
                let _ = f.write_all(prefixed.as_bytes());
            }

            // Emit event with the raw line (without trailing newline)
            let _ = app.emit(
                "agent-log-appended",
                AgentLogEvent {
                    card_id: card_id.clone(),
                    run_id: run_id.clone(),
                    line: prefixed.trim_end().to_string(),
                },
            );
        }
    });
}

/// Cancel a running agent for a card.
#[tauri::command]
pub fn cancel_agent(
    app: AppHandle,
    state: State<'_, AgentProcesses>,
    card_id: String,
) -> Result<bool, String> {
    let pid_opt = state
        .pids
        .lock()
        .map_err(|e| format!("PID lock poisoned: {e}"))?
        .remove(&card_id);

    if let Some(pid) = pid_opt {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    // Mark the current run failed
    let mut cards = load_cards();
    let now = Utc::now().to_rfc3339();
    let mut changed = false;
    if let Some(card) = cards.iter_mut().find(|c| c.id == card_id) {
        if let Some(run_id) = card.agent_run_id.clone() {
            if let Some(run) = card.run_history.iter_mut().find(|r| r.id == run_id) {
                if matches!(run.status, AgentRunStatus::Running) {
                    run.status = AgentRunStatus::Failed;
                    run.ended_at = Some(now.clone());
                }
            }
        }
        card.agent_run_id = None;
        card.agent_run_ended_at = Some(now.clone());
        card.updated_at = now;
        changed = true;
    }
    if changed {
        save_cards(&cards);
    }
    let _ = crate::tray::update_tray_status(&app);
    Ok(pid_opt.is_some())
}

/// Read the full log file for a given run.
#[tauri::command]
pub fn get_run_log(_app: AppHandle, run_id: String) -> Result<String, String> {
    let path = myra_agents_dir()
        .join("agent-runs")
        .join(format!("{run_id}.log"));
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read log {path:?}: {e}"))
}
