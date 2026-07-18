import type { AgentRun, KanbanCard } from "@/types/kanban";

/**
 * An agent execution surfaced on the History page. Flattens every card's
 * `runHistory` into individual runs (one row per attempt), keeping a link back
 * to the owning card so the agent-session detail can resolve `?card=&run=`.
 *
 * Includes both finished runs (`completed` / `failed`) and in-flight ones
 * (`running` / `needs_feedback` / `awaiting_review`) so a just-launched
 * operation shows up live; the `live` flag distinguishes them.
 */
export type PastRunStatus = AgentRun["status"];

export interface PastRun {
  runId: string;
  cardId: string;
  cardTitle: string;
  /** Schedule task id that materialized the card, if any (drives "Edit schedule"). */
  linkedTaskId?: string;
  startedAt: string;
  endedAt?: string;
  status: PastRunStatus;
  /** True when the run completed successfully (terminal `completed`). */
  ok: boolean;
  /** True while the agent process is still executing (no `endedAt` yet). Runs
   *  parked in `awaiting_review` / `needs_feedback` have ended and are NOT live. */
  live: boolean;
  /** The owning card was auto-archived (Done → Trash at midnight). Drives the
   *  archive icon so History shows it's archived rather than just trashed. */
  archived: boolean;
  /** The run was cancelled (the user stopped the agent), read straight off the
   *  run's own `canceled` status. Was inferred from card state — last run
   *  `failed` while the card landed in Done — until a genuine failure could
   *  also land the card in Done, at which point that heuristic stopped being
   *  able to tell the two apart. Shown as a grey "Canceled" verdict. */
  canceled: boolean;
  tokens?: number;
  cost?: number;
  agentPresetId?: string;
  agentFlags?: string[];
  prompt: string;
  result?: string;
}

/** Flatten every card's run history into a single, newest-first list of past runs. */
export function pastRunsFromCards(cards: KanbanCard[]): PastRun[] {
  const runs: PastRun[] = [];
  for (const card of cards) {
    const history = card.runHistory ?? [];
    for (const run of history) {
      runs.push({
        runId: run.id,
        cardId: card.id,
        cardTitle: card.title,
        linkedTaskId: card.linkedTaskId,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        status: run.status,
        ok: run.status === "completed",
        // "Live" = the agent process is still executing — i.e. no end time yet.
        // Status alone is misleading: `awaiting_review` / `needs_feedback` runs
        // have already finished (they carry an `endedAt`) and only await a human,
        // so they must not read as "Running".
        live: !run.endedAt,
        archived: Boolean(card.archivedAt),
        canceled: run.status === "canceled",
        tokens: run.tokens,
        cost: run.cost,
        agentPresetId: card.agentPresetId,
        agentFlags: card.agentFlags,
        prompt: run.prompt,
        result: run.result,
      });
    }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Resolve a single past run by card + run id (agent-session detail route). */
export function findPastRun(cards: KanbanCard[], cardId: string, runId: string): PastRun | undefined {
  return pastRunsFromCards(cards).find((r) => r.cardId === cardId && r.runId === runId);
}

export type TimeRange = "today" | "7d" | "14d" | "30d" | "all";

export const TIME_RANGES: TimeRange[] = ["today", "7d", "14d", "30d", "all"];

/** Lower bound (epoch ms) a run's `startedAt` must clear to fall inside `range`. */
export function rangeSince(range: TimeRange, now: number): number {
  const day = 86_400_000;
  switch (range) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "7d":
      return now - 7 * day;
    case "14d":
      return now - 14 * day;
    case "30d":
      return now - 30 * day;
    default:
      return 0;
  }
}

export function withinRange(run: PastRun, range: TimeRange, now: number): boolean {
  if (range === "all") return true;
  return Date.parse(run.startedAt) >= rangeSince(range, now);
}

/** "May 31 at 9:59 PM" — the Figma Triggered format. */
export function formatTriggered(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(",", " at");
}

/** Human run duration: "10 s", "3 m 12 s", "—" when unknown. */
export function formatDuration(run: PastRun): string {
  if (!run.endedAt) return "—";
  const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m} m ${rem} s` : `${m} m`;
}

/** Live elapsed time for an in-flight run: "10 s", "3 m 12 s", "—" when unknown. */
export function formatElapsed(startedAt: string, now: number): string {
  const ms = now - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m} m ${rem} s` : `${m} m`;
}

/** Duration in seconds (for the Summary sparkline tick heights), 0 when unknown. */
export function durationSeconds(run: PastRun): number {
  if (!run.endedAt) return 0;
  const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
}

/** Short run id for the "Run #1230" header (last 4 chars, uppercased). */
export function shortRunId(runId: string): string {
  return (
    runId
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-4)
      .toUpperCase() || runId
  );
}

/** Effort flag (`--effort medium` / `-c effort=…`) parsed out of the run's CLI flags. */
export function effortOf(flags?: string[]): string | undefined {
  if (!flags) return undefined;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    const eq = f.match(/effort[=\s:]+([a-zA-Z]+)/);
    if (eq) return eq[1];
    if (f === "--effort" && flags[i + 1]) return flags[i + 1];
  }
  return undefined;
}
