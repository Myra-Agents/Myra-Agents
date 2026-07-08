// Turn an agent run's raw log into a structured conversation transcript.
//
// Primary path: Claude Code `--output-format stream-json --verbose` emits
// newline-delimited JSON events (`{type:"assistant"|"user"|"result"|...}`).
// We parse those into ordered TranscriptEntry items so the run renders like a
// real chat. When the log is plain text (any agent without stream-json), we
// fall back to a single assistant text block so nothing is lost.

import type { AgentRun } from "@/types/kanban";

import { cleanLog, parseOpencodeLog } from "./opencode";
import { parseOpencodeJson } from "./opencode-json";
import type { ToolResultEntry, Transcript, TranscriptEntry } from "./types";

/** Drop the result-protocol footer we append to every prompt (see
 * `@myra/shared` `buildPrompt`) so the user turn shows only the real task. */
export function stripProtocolFooter(prompt: string): string {
  const marker = "## Myra Agents agent protocol";
  const idx = prompt.indexOf(marker);
  if (idx === -1) return prompt.trim();
  // Also drop the `---` separator that precedes it, if present.
  const head = prompt.slice(0, idx).replace(/\n+---\s*$/, "");
  return head.trim();
}

/**
 * The user turn to show for a run inside a continuous thread. A resumed run's
 * prompt carries a "## Revision instructions (most recent first)" block whose
 * item 1 is the note that triggered *this* turn (see `@myra/shared`
 * `buildPrompt`); surface just that instead of re-showing the whole task. A
 * first run has no such block, so its full (stripped) prompt is the task.
 */
export function threadUserTurn(prompt: string): string {
  const stripped = stripProtocolFooter(prompt);
  const m = /##\s*Revision instructions[^\n]*\n+\s*1\.\s*([\s\S]*?)(?:\n\s*2\.\s|\n+##\s|$)/.exec(stripped);
  return m ? m[1].trim() : stripped;
}

/** Coerce stream-json `content` (string | block[]) into display text. */
function blocksToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (typeof b === "string") return b;
      if (b && typeof b === "object" && "text" in b && typeof (b as { text: unknown }).text === "string") {
        return (b as { text: string }).text;
      }
      return "";
    })
    .join("");
}

interface ParsedEvent {
  type?: string;
  subtype?: string;
  message?: { content?: unknown; role?: string };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const STREAM_TYPES = new Set(["system", "assistant", "user", "result"]);

/** Parse the raw log into JSON events; null when it isn't stream-json. */
function parseStreamEvents(log: string): ParsedEvent[] | null {
  const lines = log.split("\n");
  const events: ParsedEvent[] = [];
  let sawStream = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line[0] !== "{") continue;
    try {
      const ev = JSON.parse(line) as ParsedEvent;
      if (ev && typeof ev === "object" && typeof ev.type === "string" && STREAM_TYPES.has(ev.type)) {
        sawStream = true;
      }
      events.push(ev);
    } catch {
      // Not JSON — ignore this line (interleaved plain stdout).
    }
  }
  return sawStream ? events : null;
}

function entriesFromEvents(events: ParsedEvent[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const ev of events) {
    switch (ev.type) {
      case "assistant": {
        const content = ev.message?.content;
        if (!Array.isArray(content)) {
          const text = blocksToText(content);
          if (text.trim()) entries.push({ kind: "text", text });
          break;
        }
        for (const block of content as Array<Record<string, unknown>>) {
          const bt = block.type;
          if (bt === "text" && typeof block.text === "string") {
            if (block.text.trim()) entries.push({ kind: "text", text: block.text });
          } else if (bt === "thinking" || bt === "redacted_thinking") {
            const text = typeof block.thinking === "string" ? block.thinking : "";
            if (text.trim()) entries.push({ kind: "thinking", text });
          } else if (bt === "tool_use") {
            entries.push({
              kind: "tool_use",
              id: typeof block.id === "string" ? block.id : "",
              name: typeof block.name === "string" ? block.name : "tool",
              input: (block.input as Record<string, unknown>) ?? {},
            });
          }
        }
        break;
      }
      case "user": {
        const content = ev.message?.content;
        if (!Array.isArray(content)) break;
        for (const block of content as Array<Record<string, unknown>>) {
          if (block.type === "tool_result") {
            const entry: ToolResultEntry = {
              kind: "tool_result",
              toolUseId: typeof block.tool_use_id === "string" ? block.tool_use_id : "",
              content: blocksToText(block.content),
              isError: block.is_error === true,
            };
            entries.push(entry);
          }
        }
        break;
      }
      case "result": {
        entries.push({
          kind: "result",
          summary: typeof ev.result === "string" ? ev.result : "",
          cost: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined,
          numTurns: typeof ev.num_turns === "number" ? ev.num_turns : undefined,
          durationMs: typeof ev.duration_ms === "number" ? ev.duration_ms : undefined,
          tokens:
            ev.usage && (ev.usage.input_tokens || ev.usage.output_tokens)
              ? (ev.usage.input_tokens ?? 0) + (ev.usage.output_tokens ?? 0)
              : undefined,
          isError: ev.subtype ? ev.subtype !== "success" : ev.is_error === true,
        });
        break;
      }
      default:
        break; // system/init and unknown events carry no conversation content.
    }
  }
  return entries;
}

/**
 * Build a conversation transcript for a run. `log` is the raw captured output
 * (`get_run_log`); `run` supplies the prompt (the human turn) and usage
 * fallbacks when the log has no terminal `result` event.
 */
export function parseTranscript(log: string | null, run: AgentRun, opts?: { userTurn?: string | null }): Transcript {
  const entries: TranscriptEntry[] = [];
  // The human turn: caller override (thread mode passes the triggering note, or
  // `null` to omit it), else the run's own stripped prompt.
  const prompt = opts && "userTurn" in opts ? opts.userTurn : stripProtocolFooter(run.prompt);
  if (prompt) entries.push({ kind: "user", text: prompt });

  const events = log ? parseStreamEvents(log) : null;
  if (events) {
    entries.push(...entriesFromEvents(events));
    return { entries, structured: true };
  }

  // opencode `--format json`: newline-delimited event stream (deduplicated,
  // structured tool I/O + markdown). Preferred over the TUI-log parser below.
  const ocJson = log ? parseOpencodeJson(log) : null;
  if (ocJson?.entries.length) {
    entries.push(...ocJson.entries);
    // Terminal result: the final status/summary come from the run (its result
    // file), enriched with the token/cost totals carried on the JSON stream.
    if (run.result?.trim() || typeof (ocJson.tokens ?? run.tokens) === "number" || run.status === "failed") {
      entries.push({
        kind: "result",
        summary: run.result?.trim() ?? "",
        tokens: ocJson.tokens ?? run.tokens,
        cost: ocJson.cost ?? run.cost,
        isError: run.status === "failed",
      });
    }
    return { entries, structured: true };
  }

  // opencode / codex terminal log (legacy `default` format): tagged action
  // stream + glyph markers. Kept for runs captured before `--format json`.
  const oc = log ? parseOpencodeLog(log) : null;
  if (oc?.length) {
    entries.push(...oc);
    return { entries, structured: true };
  }

  // Plain-text fallback: one assistant block with the (de-noised) raw output,
  // then a result summary so usage/status still surface.
  const body = log ? cleanLog(log) : "";
  if (body) entries.push({ kind: "text", text: body });
  if (run.result?.trim() || typeof run.tokens === "number" || typeof run.cost === "number") {
    entries.push({
      kind: "result",
      summary: run.result?.trim() ?? "",
      tokens: run.tokens,
      cost: run.cost,
      isError: run.status === "failed",
    });
  }
  return { entries, structured: false };
}
