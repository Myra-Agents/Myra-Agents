import type { ScheduleKind } from "@/types/schedule";

/** Connector glyphs shown in an idea card's "flow" row (trigger → app → app). */
export type ConnectorKey = "clock" | "github" | "slack" | "mail" | "globe" | "shield";

/** Use-case idea categories — the segmented tabs above the idea grid (Figma). */
export type IdeaCategory = "personal";
// | "popular" | "codeReview" | "security" | "incidents" | "dataResearch";

export const IDEA_CATEGORIES: IdeaCategory[] = ["personal"];
// ["popular", "codeReview", "security", "incidents", "dataResearch"];

/** A use-case template surfaced as an idea card. Copy comes from i18n
 *  (`schedules.ideas.<id>.{name,description,cardTitle,prompt}`); clicking "Add"
 *  opens the editor prefilled (`/schedules/edit/?template=<id>`). */
export interface ScheduleIdea {
  id: string;
  category: IdeaCategory;
  connectors: ConnectorKey[];
  schedule: ScheduleKind;
  tags: string[];
}

export const SCHEDULE_IDEAS: ScheduleIdea[] = [
  {
    id: "sortMyComputer",
    category: "personal",
    connectors: ["clock", "globe"],
    schedule: { type: "weekly", days: [1], time: "09:00" },
    tags: ["computer", "files", "organization"],
  },
  // Popular
  // {
  //   id: "dailyBrief",
  //   category: "popular",
  //   connectors: ["clock", "github", "slack"],
  //   schedule: { type: "daily", time: "09:00" },
  //   tags: ["brief"],
  // },
  // {
  //   id: "standupPrep",
  //   category: "popular",
  //   connectors: ["clock", "slack"],
  //   schedule: { type: "weekly", days: [1, 2, 3, 4, 5], time: "08:45" },
  //   tags: ["standup"],
  // },
  // {
  //   id: "weeklyReview",
  //   category: "popular",
  //   connectors: ["clock", "github"],
  //   schedule: { type: "weekly", days: [1], time: "09:00" },
  //   tags: ["review"],
  // },
  // Code review
  // {
  //   id: "prReview",
  //   category: "codeReview",
  //   connectors: ["clock", "github", "slack"],
  //   schedule: { type: "interval", start: "08:00", minutes: 120 },
  //   tags: ["review"],
  // },
  // {
  //   id: "depUpdates",
  //   category: "codeReview",
  //   connectors: ["clock", "github"],
  //   schedule: { type: "weekly", days: [1], time: "10:00" },
  //   tags: ["deps"],
  // },
  // Security
  // {
  //   id: "findVulns",
  //   category: "security",
  //   connectors: ["clock", "github", "slack"],
  //   schedule: { type: "daily", time: "07:00" },
  //   tags: ["security"],
  // },
  // {
  //   id: "secretScan",
  //   category: "security",
  //   connectors: ["clock", "github"],
  //   schedule: { type: "daily", time: "06:00" },
  //   tags: ["security"],
  // },
  // Incidents & triage
  // {
  //   id: "incidentTriage",
  //   category: "incidents",
  //   connectors: ["clock", "slack", "github"],
  //   schedule: { type: "interval", start: "00:00", minutes: 30 },
  //   tags: ["triage"],
  // },
  // {
  //   id: "errorDigest",
  //   category: "incidents",
  //   connectors: ["clock", "mail"],
  //   schedule: { type: "daily", time: "08:30" },
  //   tags: ["errors"],
  // },
  // Data & research
  // {
  //   id: "testSweep",
  //   category: "dataResearch",
  //   connectors: ["clock", "github"],
  //   schedule: { type: "daily", time: "08:00" },
  //   tags: ["tests"],
  // },
  // {
  //   id: "competitorWatch",
  //   category: "dataResearch",
  //   connectors: ["clock", "globe", "slack"],
  //   schedule: { type: "weekly", days: [1], time: "09:30" },
  //   tags: ["research"],
  // },
];

/** Look up a template by id (used by the editor's "create from template" mode). */
export function getScheduleIdea(id: string): ScheduleIdea | undefined {
  return SCHEDULE_IDEAS.find((idea) => idea.id === id);
}
