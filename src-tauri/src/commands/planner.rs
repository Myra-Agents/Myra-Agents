//! Day planner — one-shot agent that decomposes free-text objectives into
//! a list of concrete kanban tasks. Stateless and ephemeral: the result is
//! returned synchronously to the frontend, which is in charge of letting the
//! user review/edit and ultimately create the cards.

use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::commands::kanban::myra_agents_dir;

/// Maximum time we wait for `opencode run` to produce the JSON file.
const PLAN_TIMEOUT_SECS: u64 = 180;

/// Polling interval for the result file.
const POLL_MS: u64 = 250;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTask {
    pub title: String,
    pub description: String,
    pub agent_prompt: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct PlannerOutput {
    tasks: Vec<PlannedTask>,
}

fn build_planner_prompt(objectives: &str, result_path: &str) -> String {
    format!(
        "## Rôle\n\
Tu es un organiseur de journée pour un développeur. Tu transformes une liste\n\
d'objectifs en langage libre en une liste de tâches atomiques, concrètes et\n\
indépendantes. Chaque tâche doit pouvoir être exécutée seule par un agent\n\
codeur (l'agent opencode lui-même).\n\
\n\
## Objectifs de l'utilisateur\n\
{objectives}\n\
\n\
## Consignes de découpage\n\
- Vise entre 3 et 10 tâches selon la densité des objectifs.\n\
- Une tâche = un livrable clair, pas une journée entière.\n\
- Pas de tâches d'organisation/méta (genre « planifier la journée »).\n\
- Garde l'ordre logique : si B dépend de A, A vient en premier.\n\
- Les titres sont à l'impératif, courts (max 60 caractères).\n\
- La description donne le contexte en 1 à 3 phrases.\n\
- L'agentPrompt est une instruction complète et autonome — comme si tu\n\
  écrivais directement à un agent qui n'a pas vu les objectifs initiaux.\n\
- Les tags sont 1 à 3 mots-clés courts, en minuscules, sans #.\n\
\n\
## Format de sortie OBLIGATOIRE\n\
Écris UNIQUEMENT un fichier JSON à ce chemin exact :\n\
  {result_path}\n\
\n\
Structure attendue :\n\
{{\n\
  \"tasks\": [\n\
    {{\n\
      \"title\": \"...\",\n\
      \"description\": \"...\",\n\
      \"agentPrompt\": \"...\",\n\
      \"tags\": [\"...\"]\n\
    }}\n\
  ]\n\
}}\n\
\n\
N'écris RIEN d'autre. Pas de markdown, pas d'explication, pas de message dans\n\
le terminal. Juste le fichier. Après l'avoir écrit, tu peux quitter.\n"
    )
}

/// Locate a `opencode` binary. We rely on PATH like the agent launcher does.
fn opencode_command() -> Command {
    Command::new("opencode")
}

#[tauri::command]
pub async fn plan_day(
    objectives: String,
    working_dir: Option<String>,
) -> Result<Vec<PlannedTask>, String> {
    let objectives = objectives.trim().to_string();
    if objectives.is_empty() {
        return Err("Aucun objectif fourni.".to_string());
    }

    // Prepare the sandbox directory for the planner's output file.
    let dir = myra_agents_dir();
    let sessions_dir = dir.join("plan-sessions");
    fs::create_dir_all(&sessions_dir)
        .map_err(|e| format!("Impossible de créer plan-sessions: {e}"))?;

    let session_id = Uuid::new_v4().to_string();
    let result_path: PathBuf = sessions_dir.join(format!("{session_id}.json"));
    let result_path_str = result_path.to_string_lossy().replace('\\', "/");

    // Resolve working directory.
    let working_dir_pb: PathBuf = working_dir
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    if !working_dir_pb.exists() {
        return Err(format!(
            "Le dossier de travail n'existe pas: {}",
            working_dir_pb.display()
        ));
    }

    let prompt = build_planner_prompt(&objectives, &result_path_str);

    // Spawn opencode in a blocking task so the async runtime stays responsive.
    let result_path_for_task = result_path.clone();
    let working_dir_for_task = working_dir_pb.clone();

    let outcome = tauri::async_runtime::spawn_blocking(move || {
        run_planner_blocking(prompt, working_dir_for_task, result_path_for_task)
    })
    .await
    .map_err(|e| format!("Tâche d'arrière-plan interrompue: {e}"))?;

    // Always try to clean up the temp file, even on error.
    let _ = fs::remove_file(&result_path);

    outcome
}

fn run_planner_blocking(
    prompt: String,
    working_dir: PathBuf,
    result_path: PathBuf,
) -> Result<Vec<PlannedTask>, String> {
    let mut cmd = opencode_command();
    cmd.arg("run")
        .arg("--dangerously-skip-permissions")
        .arg("--")
        .arg(&prompt)
        .current_dir(&working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Impossible de lancer `opencode` (vérifie qu'il est installé et dans le PATH) : {e}"
        )
    })?;

    let started = Instant::now();
    let timeout = Duration::from_secs(PLAN_TIMEOUT_SECS);

    loop {
        // Process finished?
        match child.try_wait() {
            Ok(Some(status)) => {
                // Process exited — give the result file one last chance to appear,
                // then read it. If it's missing, surface stderr to help diagnose.
                std::thread::sleep(Duration::from_millis(POLL_MS));
                if result_path.exists() {
                    return parse_result_file(&result_path);
                }
                let stderr = collect_stderr(&mut child);
                let code = status.code().unwrap_or(-1);
                return Err(format!(
                    "L'agent s'est terminé (code {code}) sans écrire de plan.\n\
                     Stderr :\n{stderr}"
                ));
            }
            Ok(None) => { /* still running */ }
            Err(e) => return Err(format!("Erreur en attendant l'agent : {e}")),
        }

        // Result file appeared early — great, kill the process and parse.
        if result_path.exists() {
            // Give the writer a tick to flush.
            std::thread::sleep(Duration::from_millis(POLL_MS));
            let _ = child.kill();
            let _ = child.wait();
            return parse_result_file(&result_path);
        }

        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "L'agent a dépassé {PLAN_TIMEOUT_SECS}s sans produire de plan. Essaie avec\n\
                 moins d'objectifs ou un texte plus concis."
            ));
        }

        std::thread::sleep(Duration::from_millis(POLL_MS));
    }
}

fn collect_stderr(child: &mut std::process::Child) -> String {
    use std::io::Read;
    let mut buf = String::new();
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut buf);
    }
    // Truncate to avoid flooding the UI.
    if buf.len() > 800 {
        buf.truncate(800);
        buf.push_str("\n…(tronqué)");
    }
    buf
}

fn parse_result_file(path: &PathBuf) -> Result<Vec<PlannedTask>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Impossible de lire le fichier de plan {}: {e}", path.display()))?;

    // The LLM sometimes wraps JSON in code fences despite instructions.
    // Extract the first balanced {...} block as a safety net.
    let cleaned = extract_json_block(&raw).unwrap_or_else(|| raw.clone());

    let parsed: PlannerOutput = serde_json::from_str(&cleaned).map_err(|e| {
        let preview: String = cleaned.chars().take(300).collect();
        format!("Réponse de l'agent illisible (JSON invalide : {e}).\nDébut du contenu :\n{preview}")
    })?;

    // Sanity: filter out empty entries.
    let tasks: Vec<PlannedTask> = parsed
        .tasks
        .into_iter()
        .filter(|t| !t.title.trim().is_empty())
        .collect();

    Ok(tasks)
}

/// Find the first balanced `{...}` substring. Naive but good enough for
/// LLM output where the JSON is usually the bulk of the message.
fn extract_json_block(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let start = bytes.iter().position(|&b| b == b'{')?;
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if in_str {
            if escape {
                escape = false;
            } else if b == b'\\' {
                escape = true;
            } else if b == b'"' {
                in_str = false;
            }
            continue;
        }
        match b {
            b'"' => in_str = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(s[start..=i].to_string());
                }
            }
            _ => {}
        }
    }
    None
}
