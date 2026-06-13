// Structured conversation transcript derived from an agent run's raw log.
// Mirrors the shape of Claude Code's `--output-format stream-json` events so a
// run can be rendered as a chat-style conversation (user / assistant / tool
// calls / reasoning) instead of an opaque text dump. Parsing lives in
// `parse.ts`; the renderer in `components/conversation/`.

/** One entry in a rendered conversation, in chronological order. */
export type TranscriptEntry = UserEntry | TextEntry | ThinkingEntry | ToolUseEntry | ToolResultEntry | ResultEntry;

/** The human turn — the prompt that launched (or steered) the run. */
export interface UserEntry {
  kind: "user";
  text: string;
}

/** Assistant prose (markdown). */
export interface TextEntry {
  kind: "text";
  text: string;
}

/** Assistant reasoning / extended thinking, shown collapsed by default. */
export interface ThinkingEntry {
  kind: "thinking";
  text: string;
}

/** A tool the agent invoked (Read, Edit, Bash, …) with its input. */
export interface ToolUseEntry {
  kind: "tool_use";
  /** Provider tool-call id, used to pair with its result. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** The output returned to the agent for a prior `tool_use`. */
export interface ToolResultEntry {
  kind: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
}

/** The terminal result event: final summary + usage. */
export interface ResultEntry {
  kind: "result";
  summary: string;
  tokens?: number;
  cost?: number;
  durationMs?: number;
  numTurns?: number;
  isError: boolean;
}

export interface Transcript {
  entries: TranscriptEntry[];
  /** True when the raw log parsed as structured stream-json events. When
   * false, `entries` holds a single best-effort text block (plain-text log). */
  structured: boolean;
}
