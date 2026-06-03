/**
 * Day planner types — mirror of Rust backend.
 */

export interface PlannedTask {
  title: string;
  description: string;
  agentPrompt: string;
  tags: string[];
}

/** Modal-side draft with a stable local id for React keying. */
export interface DraftTask extends PlannedTask {
  localId: string;
  /** True for tasks the user added by hand (not from the LLM). */
  manuallyAdded?: boolean;
}

/** Tag stamped on every card produced by a planning session. */
export function todaysPlanTag(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `🗓 plan-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

let counter = 0;
export function newLocalId(): string {
  counter += 1;
  return `draft-${Date.now()}-${counter}`;
}

export function toDraft(task: PlannedTask): DraftTask {
  return { ...task, localId: newLocalId() };
}

export function emptyDraft(): DraftTask {
  return {
    localId: newLocalId(),
    title: "",
    description: "",
    agentPrompt: "",
    tags: [],
    manuallyAdded: true,
  };
}
