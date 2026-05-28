/**
 * Agent & settings types for the multi-backend agent system.
 */

export interface AgentPreset {
  id: string;
  name: string;
  binary: string;
  argsTemplate: string;
  workingDir?: string;
}

export interface AppSettings {
  defaultAgentId: string;
  agents: AgentPreset[];
  defaultHomePage: "kanban" | "schedules" | "planner" | "logs";
  locale: "auto" | "en" | "fr";
  theme: "light" | "dark" | "system";
}

export const DEFAULT_AGENT_PRESETS: AgentPreset[] = [
  {
    id: "opencode",
    name: "OpenCode",
    binary: "opencode",
    argsTemplate: "run {prompt} --dangerously-skip-permissions",
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    binary: "copilot",
    argsTemplate: "-p {prompt} --yolo",
  },
  {
    id: "claude",
    name: "Claude CLI",
    binary: "claude",
    argsTemplate: "--dangerously-skip-permissions -p {prompt}",
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  defaultAgentId: "opencode",
  agents: DEFAULT_AGENT_PRESETS,
  defaultHomePage: "kanban",
  locale: "auto",
  theme: "system",
};
