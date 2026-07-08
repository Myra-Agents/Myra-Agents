// Parse opencode's `--format json` NDJSON event stream into a transcript.
//
// With `run --format json`, opencode emits one JSON object per line (on stdout)
// instead of its ANSI/glyph TUI log. Each event carries a `part` whose `type`
// is one of `step-start` | `tool` | `text` | `step-finish`. Unlike the TUI log,
// every action appears exactly once (no pending→done re-print), tool I/O and
// markdown text are structured, and token/cost totals ride on `step-finish`.
//
// Shape (observed on opencode 1.17.x):
//   {"type":"step_start", "part":{"type":"step-start","id":"prt_…","sessionID":"ses_…"}}
//   {"type":"tool_use",   "part":{"type":"tool","id":"prt_…","tool":"read",
//                                 "state":{"status":"completed","input":{…},"output":"…"}}}
//   {"type":"text",       "part":{"type":"text","id":"prt_…","text":"…markdown…"}}
//   {"type":"step_finish","part":{"type":"step-finish","tokens":{…},"cost":0}}

import type { TranscriptEntry } from "./types";

interface OcState {
  status?: string;
  input?: Record<string, unknown>;
  output?: string;
}
interface OcTokens {
  total?: number;
  input?: number;
  output?: number;
}
interface OcPart {
  type?: string;
  id?: string;
  sessionID?: string;
  tool?: string;
  state?: OcState;
  text?: string;
  tokens?: OcTokens;
  cost?: number;
}
interface OcEvent {
  type?: string;
  part?: OcPart;
  sessionID?: string;
}

/** opencode part.type values that mark a real event (vs. claude stream-json). */
const OC_PART_TYPES = new Set(["step-start", "tool", "text", "step-finish", "reasoning"]);

/** Title-case a tool name so `read` renders like Claude's `Read`. */
function toolName(raw: string | undefined): string {
  const t = (raw ?? "tool").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "tool";
}

/** Map opencode's input keys onto the canonical ones the renderer summarizes
 * (`file_path`, `command`, `pattern`, `url`, …) so the one-line arg shows. */
function normalizeInput(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = { ...input };
  if ("filePath" in out && !("file_path" in out)) {
    out.file_path = out.filePath;
    delete out.filePath;
  }
  return out;
}

export interface OpencodeJsonResult {
  entries: TranscriptEntry[];
  /** Summed token total across all `step-finish` events, if any reported it. */
  tokens?: number;
  /** Summed cost (USD) across all `step-finish` events, if any reported it. */
  cost?: number;
  /** The opencode session id, for resuming the conversation (`opencode -s`). */
  sessionId?: string;
}

/**
 * Parse an opencode `--format json` NDJSON log, or null when the log carries no
 * opencode JSON events (so the caller can fall back to the TUI-log parser).
 */
export function parseOpencodeJson(log: string): OpencodeJsonResult | null {
  const entries: TranscriptEntry[] = [];
  let sawEvent = false;
  let tokens: number | undefined;
  let cost: number | undefined;
  let sessionId: string | undefined;

  for (const raw of log.split("\n")) {
    const line = raw.trim();
    if (!line || line[0] !== "{") continue;
    let ev: OcEvent;
    try {
      ev = JSON.parse(line) as OcEvent;
    } catch {
      continue; // interleaved non-JSON (e.g. a stray `[err]` diagnostic).
    }
    const part = ev.part;
    if (!part || typeof part.type !== "string" || !OC_PART_TYPES.has(part.type)) continue;
    sawEvent = true;
    sessionId ??= part.sessionID ?? ev.sessionID;

    switch (part.type) {
      case "tool": {
        const id = part.id ?? "";
        entries.push({
          kind: "tool_use",
          id,
          name: toolName(part.tool),
          input: normalizeInput(part.state?.input),
        });
        const output = part.state?.output;
        if (typeof output === "string" && output.trim()) {
          entries.push({
            kind: "tool_result",
            toolUseId: id,
            content: output,
            isError: part.state?.status === "error",
          });
        }
        break;
      }
      case "text": {
        if (typeof part.text === "string" && part.text.trim()) {
          entries.push({ kind: "text", text: part.text });
        }
        break;
      }
      case "reasoning": {
        if (typeof part.text === "string" && part.text.trim()) {
          entries.push({ kind: "thinking", text: part.text });
        }
        break;
      }
      case "step-finish": {
        if (typeof part.tokens?.total === "number") tokens = (tokens ?? 0) + part.tokens.total;
        if (typeof part.cost === "number") cost = (cost ?? 0) + part.cost;
        break;
      }
      default:
        break; // step-start: turn boundary, no content.
    }
  }

  if (!sawEvent) return null;
  return { entries, tokens, cost, sessionId };
}
