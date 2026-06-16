import type { KanbanCard } from "@/types/kanban";

/** Number of days charted; KPIs cover the last `KPI_DAYS` of that window. */
export const CHART_DAYS = 14;
export const KPI_DAYS = 7;

export interface DayStat {
  label: string;
  completed: number;
  failed: number;
  cost: number;
}

export interface OverviewStats {
  daily: DayStat[];
  kpis: {
    runs: number;
    successRate: number | null;
    cost: number;
    avgDurationMs: number | null;
  };
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Roll up each card's finished runs into a `CHART_DAYS`-long daily series plus
 * `KPI_DAYS` headline numbers (runs, success rate, spend, average duration).
 * Shared by the home Overview and the tray popover so the two never drift.
 */
export function buildStats(cards: KanbanCard[]): OverviewStats {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byKey = new Map<string, DayStat>();
  const daily: DayStat[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const stat: DayStat = {
      label: d.toLocaleDateString(undefined, { day: "numeric", month: "numeric" }),
      completed: 0,
      failed: 0,
      cost: 0,
    };
    byKey.set(localDayKey(d), stat);
    daily.push(stat);
  }

  const kpiCutoff = new Date(today);
  kpiCutoff.setDate(kpiCutoff.getDate() - (KPI_DAYS - 1));
  let runs = 0;
  let completed = 0;
  let cost = 0;
  let durationMs = 0;
  let durationCount = 0;

  for (const card of cards) {
    for (const run of card.runHistory ?? []) {
      if (run.status !== "completed" && run.status !== "failed") continue;
      const started = new Date(run.startedAt);
      const slot = byKey.get(localDayKey(started));
      if (slot) {
        if (run.status === "completed") slot.completed++;
        else slot.failed++;
        slot.cost += run.cost ?? 0;
      }
      if (started >= kpiCutoff) {
        runs++;
        if (run.status === "completed") completed++;
        cost += run.cost ?? 0;
        if (run.endedAt) {
          const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
          if (ms > 0) {
            durationMs += ms;
            durationCount++;
          }
        }
      }
    }
  }

  return {
    daily,
    kpis: {
      runs,
      successRate: runs > 0 ? completed / runs : null,
      cost,
      avgDurationMs: durationCount > 0 ? durationMs / durationCount : null,
    },
  };
}

export function formatMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
