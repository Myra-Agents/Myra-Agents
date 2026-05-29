use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::kanban::myra_agents_dir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentPreset {
    pub id: String,
    pub name: String,
    pub binary: String,
    pub args_template: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_agent_id")]
    pub default_agent: String,
    #[serde(default = "default_agent_presets")]
    pub agents: Vec<AgentPreset>,
    /// Maximum number of agents allowed to run concurrently. 0 = unlimited.
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_agents: u32,
}

fn default_agent_id() -> String {
    "opencode".to_string()
}

fn default_max_concurrent() -> u32 {
    2
}

fn default_agent_presets() -> Vec<AgentPreset> {
    vec![
        AgentPreset {
            id: "opencode".to_string(),
            name: "OpenCode".to_string(),
            binary: "opencode".to_string(),
            args_template: "run {prompt} --dangerously-skip-permissions".to_string(),
            working_dir: None,
        },
        AgentPreset {
            id: "copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            binary: "copilot".to_string(),
            args_template: "-p {prompt} --yolo".to_string(),
            working_dir: None,
        },
        AgentPreset {
            id: "claude".to_string(),
            name: "Claude".to_string(),
            binary: "claude".to_string(),
            args_template: "--dangerously-skip-permissions -p {prompt}".to_string(),
            working_dir: None,
        },
    ]
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_agent: default_agent_id(),
            agents: default_agent_presets(),
            max_concurrent_agents: default_max_concurrent(),
        }
    }
}

fn settings_path() -> PathBuf {
    myra_agents_dir().join("settings.json")
}

fn normalize_settings(mut settings: Settings) -> Settings {
    let defaults = default_agent_presets();
    if settings.agents.is_empty() {
        settings.agents = defaults;
    } else {
        for preset in defaults {
            if !settings.agents.iter().any(|existing| existing.id == preset.id) {
                settings.agents.push(preset);
            }
        }
    }

    if settings.default_agent.trim().is_empty()
        || !settings
            .agents
            .iter()
            .any(|preset| preset.id == settings.default_agent)
    {
        settings.default_agent = settings
            .agents
            .first()
            .map(|preset| preset.id.clone())
            .unwrap_or_else(default_agent_id);
    }

    settings
}

fn write_settings(settings: &Settings) -> Result<(), String> {
    let path = settings_path();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write settings {}: {e}", path.display()))
}

pub fn load_settings() -> Settings {
    let path = settings_path();
    let loaded = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
        .unwrap_or_default();

    let normalized = normalize_settings(loaded);
    let _ = write_settings(&normalized);
    normalized
}

pub fn resolve_agent_preset(preset_id: Option<&str>) -> Result<AgentPreset, String> {
    let settings = load_settings();
    let resolved_id = preset_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .unwrap_or(settings.default_agent.as_str());

    settings
        .agents
        .into_iter()
        .find(|preset| preset.id == resolved_id)
        .ok_or_else(|| format!("Unknown agent preset: {}", resolved_id))
}

#[tauri::command]
pub fn get_settings() -> Settings {
    load_settings()
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<Settings, String> {
    let normalized = normalize_settings(settings);
    write_settings(&normalized)?;
    Ok(normalized)
}
