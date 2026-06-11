/**
 * Two-way bridge between a {@link ScheduleKind} and a 5-field cron expression,
 * powering the schedule editor's "cron equivalent" field: editing the
 * structured fields refreshes the cron text, and editing the cron text snaps the
 * kind back to daily/weekly/interval when it matches a known pattern, or to a
 * raw `cron` kind ("custom") when it doesn't.
 *
 * Cron weekday is 0-7 with 0/7 = Sunday; our schedules use ISO 1-7 (Mon-Sun).
 */
import type { ScheduleKind } from "@/types/schedule";

const isoToCronDow = (d: number): number => (d === 7 ? 0 : d);
const cronToIsoDow = (d: number): number => (d === 0 ? 7 : d);

const hhmm = (h: number, m: number): string => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * Derive a 5-field cron string equivalent to a schedule, or `null` when the kind
 * can't be expressed as cron (one-shot runs, or intervals that don't divide an
 * hour evenly).
 */
export function scheduleToCron(kind: ScheduleKind): string | null {
  switch (kind.type) {
    case "cron":
      return kind.expr;
    case "daily": {
      const [h, m] = kind.time.split(":").map(Number);
      if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
      return `${m} ${h} * * *`;
    }
    case "weekly": {
      const [h, m] = kind.time.split(":").map(Number);
      if (!Number.isInteger(h) || !Number.isInteger(m) || kind.days.length === 0) return null;
      const dow = [...kind.days]
        .sort((a, b) => a - b)
        .map(isoToCronDow)
        .join(",");
      return `${m} ${h} * * ${dow}`;
    }
    case "interval":
      // Only sub-hour, hour-dividing intervals map cleanly to a cron step.
      if (kind.minutes > 0 && kind.minutes < 60 && 60 % kind.minutes === 0) {
        return `*/${kind.minutes} * * * *`;
      }
      return null;
    case "once":
      return null;
  }
}

/**
 * Parse a 5-field cron into a known {@link ScheduleKind}, or a `cron` kind
 * ("custom") when it doesn't match a daily/weekly/interval shape. Returns `null`
 * only when the input isn't 5 whitespace-separated fields, so callers can hold a
 * half-typed draft without it collapsing.
 */
export function cronToSchedule(expr: string): ScheduleKind | null {
  const trimmed = expr.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts;
  const cron: ScheduleKind = { type: "cron", expr: trimmed };

  // */N * * * *  → interval every N minutes
  const step = /^\*\/(\d+)$/.exec(min);
  if (step && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    const n = Number(step[1]);
    return n > 0 ? { type: "interval", start: "00:00", minutes: n } : cron;
  }

  const numMin = Number(min);
  const numHr = Number(hr);
  const fixedTime = /^\d+$/.test(min) && /^\d+$/.test(hr) && numMin < 60 && numHr < 24;
  if (fixedTime && dom === "*" && mon === "*") {
    // m h * * *  → daily
    if (dow === "*") return { type: "daily", time: hhmm(numHr, numMin) };
    // m h * * <dow>  → weekly
    const days = parseDow(dow);
    if (days) return { type: "weekly", days, time: hhmm(numHr, numMin) };
  }
  return cron;
}

/** Parse a cron weekday field (`1`, `1-5`, `1,3,5`) into sorted ISO days, or null. */
function parseDow(field: string): number[] | null {
  const out = new Set<number>();
  for (const token of field.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b || a > 7 || b > 7) return null;
      for (let d = a; d <= b; d++) out.add(cronToIsoDow(d % 7));
    } else if (/^\d+$/.test(token) && Number(token) <= 7) {
      out.add(cronToIsoDow(Number(token) % 7));
    } else {
      return null;
    }
  }
  const days = [...out].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  return days.length ? days : null;
}
