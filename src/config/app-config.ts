import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Myra Agents",
  version: packageJson.version,
  copyright: `© ${currentYear}, Myra Agents.`,
  /** Public repo — surfaced in the sidebar support card ("open an issue"). */
  repoUrl: "https://github.com/myra-agents/myra-agents",
  /** Direct link to open a new issue on the tracker. */
  issuesUrl: "https://github.com/myra-agents/myra-agents/issues/new",
  meta: {
    title: "Myra Agents — AI-Powered Task Automation",
    description:
      "Myra Agents is a desktop productivity app that schedules and runs AI agent tasks with a Kanban board, live logs, and recurring schedules.",
  },
};
