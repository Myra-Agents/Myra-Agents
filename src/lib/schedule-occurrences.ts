/**
 * Client-side expansion of a {@link ScheduledTask} into concrete fire times
 * inside a window, plus per-schedule run statistics — the data the calendar view
 * (issue #181) paints. The scheduler itself lives in the Rust/Node backend; this
 * is a *preview* of when a schedule will fire, derived from its structured
 * {@link ScheduleKind} (or, for `cron`, a minimal 5-field expander), so the month
 * / week / day grids can be drawn without a round-trip.
 *
 * Everything here is pure and deterministic given its `Date` inputs (the caller
 * passes `now`), so it stays testable and SSR-safe.
 */
import { entityIdOf } from "@/lib/aggregate/global-id";
import { pastRunsFromCards } from "@/lib/history/past-runs";
import type { KanbanCard } from "@/types/kanban";
import type { ScheduledTask, ScheduleKind } from "@/types/schedule";

/** Cap on occurrences returned per schedule *per calendar day*. A high-frequency
 *  schedule (e.g. every 15 min) still shows its true daily count, but a runaway
 *  sub-minute interval / cron is bounded so a day never renders thousands of
 *  blocks — and, crucially, the count stays consistent across the window instead
 *  of a single global cap front-loading everything into the first few days. */
const MAX_PER_DAY = 96;
/** Absolute per-schedule ceiling across the whole window — a final backstop on
 *  top of the per-day cap (matters for long "all"-style ranges). */
const MAX_OCCURRENCES = MAX_PER_DAY * 45;

/** Local `YYYY-M-D` key used to bucket the per-day cap. */
function dayBucket(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function parseHm(value: string): { h: number; m: number } | null {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** ISO weekday (1 = Mon … 7 = Sun) of a local date. */
function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

/** A local {@link Date} at `date`'s calendar day, set to `h:m:00.000`. */
function atTime(date: Date, h: number, m: number): Date {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Midnight (local) of the day `date` falls on. */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Every fire time of `schedule` in the half-open window `[from, to)`, ascending.
 * A disabled schedule still expands — the calendar dims paused blocks rather than
 * hiding them (the "hide paused" toggle filters at the view layer).
 */
export function expandOccurrences(schedule: ScheduleKind, from: Date, to: Date): Date[] {
  if (to <= from) return [];
  const out: Date[] = [];
  const perDay = new Map<string, number>();
  // Push `d` if it lies in `[from, to)` and neither the per-day nor the total cap
  // is exhausted for its calendar day. Returns false only on the total backstop,
  // so callers can stop iterating entirely.
  const push = (d: Date): boolean => {
    if (out.length >= MAX_OCCURRENCES) return false;
    if (d < from || d >= to) return true;
    const key = dayBucket(d);
    const n = perDay.get(key) ?? 0;
    if (n >= MAX_PER_DAY) return true;
    perDay.set(key, n + 1);
    out.push(new Date(d));
    return true;
  };

  switch (schedule.type) {
    case "once": {
      const at = new Date(schedule.at);
      if (!Number.isNaN(at.getTime())) push(at);
      break;
    }
    case "daily": {
      const t = parseHm(schedule.time);
      if (!t) break;
      for (let d = startOfDay(from); d < to; d.setDate(d.getDate() + 1)) {
        if (!push(atTime(d, t.h, t.m))) break;
      }
      break;
    }
    case "weekly": {
      const t = parseHm(schedule.time);
      if (!t || schedule.days.length === 0) break;
      const days = new Set(schedule.days);
      for (let d = startOfDay(from); d < to; d.setDate(d.getDate() + 1)) {
        if (days.has(isoWeekday(d)) && !push(atTime(d, t.h, t.m))) break;
      }
      break;
    }
    case "interval": {
      const t = parseHm(schedule.start);
      if (!t || schedule.minutes <= 0) break;
      const stepMs = schedule.minutes * 60_000;
      // Anchor the continuous grid to `start` on the window's first day, then
      // walk back onto the tick at/just before `from` so cross-midnight ticks
      // inherited from the previous day are not dropped.
      let cursor = atTime(startOfDay(from), t.h, t.m).getTime();
      while (cursor > from.getTime()) cursor -= stepMs;
      while (cursor < from.getTime()) cursor += stepMs;
      for (; cursor < to.getTime(); cursor += stepMs) {
        if (!push(new Date(cursor))) break;
      }
      break;
    }
    case "cron":
      expandCron(schedule.expr, from, to, push);
      break;
  }
  return out;
}

// ── minimal 5-field cron expander ────────────────────────────────────────────
// Supports `*`, lists (`a,b`), ranges (`a-b`), and steps (`*/n`, `a-b/n`) on the
// standard `minute hour day-of-month month day-of-week` layout (weekday 0/7 =
// Sunday). Unparseable expressions yield no occurrences (the block simply
// doesn't preview) rather than throwing.

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) return null;
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else {
      const range = /^(\d+)-(\d+)$/.exec(rangePart);
      if (range) {
        lo = Number(range[1]);
        hi = Number(range[2]);
      } else if (/^\d+$/.test(rangePart)) {
        lo = Number(rangePart);
        hi = stepPart === undefined ? lo : max;
      } else {
        return null;
      }
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

function expandCron(expr: string, from: Date, to: Date, push: (d: Date) => boolean): void {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return;
  const minutes = parseField(parts[0], 0, 59);
  const hours = parseField(parts[1], 0, 23);
  const doms = parseField(parts[2], 1, 31);
  const months = parseField(parts[3], 1, 12);
  const dows = parseField(parts[4], 0, 7);
  if (!minutes || !hours || !doms || !months || !dows) return;
  // Cron weekday: 7 and 0 both mean Sunday.
  if (dows.has(7)) dows.add(0);
  const domRestricted = parts[2] !== "*";
  const dowRestricted = parts[4] !== "*";
  const sortedHours = [...hours].sort((a, b) => a - b);
  const sortedMinutes = [...minutes].sort((a, b) => a - b);

  for (let day = startOfDay(from); day < to; day.setDate(day.getDate() + 1)) {
    if (!months.has(day.getMonth() + 1)) continue;
    const domOk = doms.has(day.getDate());
    const dowOk = dows.has(day.getDay());
    // Standard cron: when BOTH day fields are restricted, either matching fires.
    const dayMatches =
      domRestricted && dowRestricted ? domOk || dowOk : domRestricted ? domOk : dowRestricted ? dowOk : true;
    if (!dayMatches) continue;
    for (const h of sortedHours) {
      for (const m of sortedMinutes) {
        if (!push(atTime(day, h, m))) return;
      }
    }
  }
}

// ── per-schedule run statistics (issue #144 surface: duration / cost / rate) ──

/** Rolled-up run history for one schedule, keyed off the cards it materialized. */
export interface ScheduleStats {
  /** Total finished (completed or failed) runs counted. */
  runs: number;
  /** Fraction in `[0,1]` of finished runs that completed successfully. */
  successRate: number;
  /** Mean wall-clock duration in seconds across finished runs (0 when unknown). */
  avgDurationSec: number;
  /** Mean tokens across runs that reported usage (0 when none did). */
  avgTokens: number;
  /** Mean cost (USD) across runs that reported it (0 when none did). */
  avgCost: number;
  /** Verdict of the most recent run — drives the block's status colour. */
  lastStatus: "completed" | "failed" | "running" | "never";
}

const EMPTY_STATS: ScheduleStats = {
  runs: 0,
  successRate: 0,
  avgDurationSec: 0,
  avgTokens: 0,
  avgCost: 0,
  lastStatus: "never",
};

/**
 * Build a `taskId → stats` map from every card's run history. Schedule ids are
 * connection-scoped GlobalIds while a card stores the bare task id, so callers
 * resolve a schedule with {@link statsForSchedule}, which strips the connection
 * prefix before the lookup.
 */
export function buildScheduleStats(cards: KanbanCard[]): Map<string, ScheduleStats> {
  const byTask = new Map<string, ScheduleStats>();
  const runsByTask = new Map<string, ReturnType<typeof pastRunsFromCards>>();
  for (const run of pastRunsFromCards(cards)) {
    if (!run.linkedTaskId) continue;
    const list = runsByTask.get(run.linkedTaskId) ?? [];
    list.push(run);
    runsByTask.set(run.linkedTaskId, list);
  }

  for (const [taskId, runs] of runsByTask) {
    // pastRunsFromCards returns newest-first; the head is the latest attempt.
    const latest = runs[0];
    const finished = runs.filter((r) => r.status === "completed" || r.status === "failed");
    const successes = finished.filter((r) => r.ok).length;

    const durations = finished
      .map((r) => (r.endedAt ? (Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000 : 0))
      .filter((s) => s > 0);
    const tokenRuns = runs.map((r) => r.tokens).filter((t): t is number => typeof t === "number");
    const costRuns = runs.map((r) => r.cost).filter((c): c is number => typeof c === "number");

    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

    byTask.set(taskId, {
      runs: finished.length,
      successRate: finished.length ? successes / finished.length : 0,
      avgDurationSec: mean(durations),
      avgTokens: mean(tokenRuns),
      avgCost: mean(costRuns),
      lastStatus: latest.live
        ? "running"
        : latest.status === "completed"
          ? "completed"
          : latest.status === "failed"
            ? "failed"
            : finished.length
              ? finished[0].ok
                ? "completed"
                : "failed"
              : "never",
    });
  }
  return byTask;
}

/** Resolve the stats for a schedule (strips its connection prefix first). */
export function statsForSchedule(
  stats: Map<string, ScheduleStats>,
  schedule: Pick<ScheduledTask, "id">,
): ScheduleStats {
  return stats.get(entityIdOf(schedule.id)) ?? EMPTY_STATS;
}

/** Semantic status of a single calendar block. `paused` wins over run history so
 *  a disabled schedule always reads as inert regardless of its last run. */
export type OccurrenceStatus = "paused" | "running" | "completed" | "failed" | "never";

/** Status a block should paint with, folding the paused flag into the schedule's
 *  last-run verdict. */
export function occurrenceStatus(enabled: boolean, stats: ScheduleStats): OccurrenceStatus {
  if (!enabled) return "paused";
  return stats.lastStatus;
}
