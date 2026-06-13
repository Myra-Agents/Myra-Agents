// Parse an opencode/codex-style run log into a conversation transcript.
//
// Unlike Claude Code's stream-json, opencode prints a human terminal log: the
// model's narration to stdout (untagged) and its action trail to stderr (which
// the Myra sidecar tags `[err] `), peppered with ANSI colors and single-glyph
// markers: `$` shell, `→` read, `←` edit, `%` web fetch, `✱` glob, `✓`/`✗`
// status, `#` heading. We strip the noise and turn those markers into the same
// TranscriptEntry shapes the Claude renderer already knows how to draw.

import type { TranscriptEntry } from "./types";

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI SGR escapes is the point.
const ANSI = /\[[0-9;]*m/g;
const STREAM_TAG = /^\[(err|out|log)\]\s?/;

/** Strip ANSI color escapes from a line. */
function stripAnsi(s: string): string {
  return s.replace(ANSI, "");
}

interface Line {
  /** "err" = action stream (stderr), "out" = model prose (stdout/untagged). */
  stream: "err" | "out";
  text: string;
}

/** Split the raw log into ANSI-free, tag-free, stream-classified lines. */
function tokenize(log: string): Line[] {
  return log.split("\n").map((raw) => {
    const tag = STREAM_TAG.exec(raw);
    const stream: "err" | "out" = tag?.[1] === "err" ? "err" : "out";
    const text = stripAnsi(tag ? raw.slice(tag[0].length) : raw);
    return { stream, text };
  });
}

const MARKERS = ["$", "→", "←", "%", "✱", "✓", "✗", ">", "#"];

function isMarker(line: string): boolean {
  const c = line.trimStart()[0];
  return c !== undefined && MARKERS.includes(c);
}

/** "Read app/foo.ts" → { name: "Read", arg: "app/foo.ts" }. */
function splitOp(rest: string): { name: string; arg: string } {
  const m = /^(\S+)\s*(.*)$/.exec(rest.trim());
  return { name: m?.[1] ?? "tool", arg: m?.[2]?.trim() ?? "" };
}

function inputFor(name: string, arg: string): Record<string, unknown> {
  const k = name.toLowerCase();
  if (k === "bash") return { command: arg };
  if (k === "glob" || k === "grep") return { pattern: arg };
  if (k === "webfetch" || k === "websearch") return { url: arg };
  return { file_path: arg };
}

/**
 * Build transcript entries from an opencode log, or null when the log shows no
 * opencode structure (so the caller can fall back to plain text).
 */
export function parseOpencodeLog(log: string): TranscriptEntry[] | null {
  const lines = tokenize(log);
  const looksLikeOpencode =
    /^\[(err|out)\]/m.test(log) ||
    lines.some((l) => l.stream === "err" && isMarker(l.text)) ||
    /\[myra-agents\]/.test(log);
  if (!looksLikeOpencode) return null;

  const entries: TranscriptEntry[] = [];
  let prose: string[] = [];
  let toolIdx = 0;
  // The tool whose output we're currently collecting (Bash stdout, Edit diff…).
  let pending: { id: string; buf: string[] } | null = null;

  const flushProse = () => {
    const text = prose.join("\n").trim();
    if (text) entries.push({ kind: "text", text });
    prose = [];
  };
  const flushPending = () => {
    if (!pending) return;
    const content = pending.buf.join("\n").trim();
    if (content) {
      entries.push({ kind: "tool_result", toolUseId: pending.id, content, isError: false });
    }
    pending = null;
  };

  for (const line of lines) {
    const text = line.text;
    const trimmed = text.trim();

    // Drop the sidecar's own banners ("[myra-agents] … exited with code N").
    if (trimmed.startsWith("[myra-agents]")) continue;

    // Model prose (stdout): narration between actions.
    if (line.stream === "out") {
      if (!trimmed && prose.length === 0) continue; // skip leading blanks
      flushPending();
      prose.push(text);
      continue;
    }

    // Action stream (stderr).
    if (!trimmed) {
      // Blank line inside command output is meaningful; elsewhere ignore.
      if (pending) pending.buf.push("");
      continue;
    }

    const glyph = trimmed[0];
    const rest = trimmed.slice(1).trim();

    if (!MARKERS.includes(glyph)) {
      // Non-marker action line = output of the pending tool, else stray log.
      if (pending) pending.buf.push(text);
      continue;
    }

    // A marker starts something new: close prose + any open tool output.
    flushProse();

    switch (glyph) {
      case ">": {
        // Model banner ("build · qwen3-coder:latest") — skip.
        flushPending();
        break;
      }
      case "$": {
        flushPending();
        const id = `oc-${toolIdx++}`;
        entries.push({ kind: "tool_use", id, name: "Bash", input: { command: rest } });
        pending = { id, buf: [] };
        break;
      }
      case "→":
      case "←":
      case "%": {
        flushPending();
        const { name, arg } = splitOp(rest);
        const id = `oc-${toolIdx++}`;
        entries.push({ kind: "tool_use", id, name, input: inputFor(name, arg) });
        pending = { id, buf: [] }; // diff / fetched content follows for ← / %
        break;
      }
      case "✱": {
        // Self-contained: `Glob "**/x" 0 matches`.
        flushPending();
        const { name, arg } = splitOp(rest);
        const id = `oc-${toolIdx++}`;
        entries.push({ kind: "tool_use", id, name, input: inputFor(name, arg) });
        pending = null;
        break;
      }
      case "✗": {
        // Failed op: `Read foo.ts failed`; the next `Error:` lines detail it.
        flushPending();
        const { name, arg } = splitOp(rest);
        const id = `oc-${toolIdx++}`;
        entries.push({ kind: "tool_use", id, name, input: inputFor(name, arg.replace(/\s*failed$/, "")) });
        pending = { id, buf: [] };
        // Mark this pending as error on flush by pre-seeding a flag via name.
        entries.push({ kind: "tool_result", toolUseId: id, content: rest, isError: true });
        pending = null;
        break;
      }
      case "✓": {
        flushPending();
        prose.push(`✓ ${rest}`);
        flushProse();
        break;
      }
      case "#": {
        // Heading (e.g. "# Todos"): fold it + following items into prose.
        flushPending();
        prose.push(`**${rest}**`);
        break;
      }
      default:
        break;
    }
  }
  flushPending();
  flushProse();

  // Surface a failure footer only for a non-zero exit — a clean exit is noise.
  const exit = /\[myra-agents\][^\n]*exited with code (\d+)/.exec(log);
  if (exit) {
    const code = Number(exit[1]);
    if (code !== 0) entries.push({ kind: "result", summary: `Process exited with code ${code}.`, isError: true });
  }

  return entries.length ? entries : null;
}

/** Strip ANSI + stream tags for a readable plain-text fallback. */
export function cleanLog(log: string): string {
  return log
    .split("\n")
    .map((raw) => {
      const tag = STREAM_TAG.exec(raw);
      return stripAnsi(tag ? raw.slice(tag[0].length) : raw);
    })
    .join("\n")
    .trim();
}
