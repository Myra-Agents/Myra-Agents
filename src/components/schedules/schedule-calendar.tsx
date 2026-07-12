"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { BotIcon, ChevronLeftIcon, ChevronRightIcon, TerminalIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { MyraMark } from "@/components/ui/myra-mark";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/use-settings";
import {
  buildScheduleStats,
  expandOccurrences,
  type OccurrenceStatus,
  occurrenceStatus,
  type ScheduleStats,
  statsForSchedule,
} from "@/lib/schedule-occurrences";
import { cn } from "@/lib/utils";
import type { KanbanCard } from "@/types/kanban";
import type { ScheduledTask } from "@/types/schedule";
import { describeSchedule } from "@/types/schedule";
import type { AgentPreset } from "@/types/settings";

export type CalendarView = "month" | "week" | "day";

/** More occurrences than this in a single day (month) / hour (week·day) trips the
 *  WIP-density warning (issue #61 overlap surfacing). */
const DENSITY_LIMIT = 4;
/** Pixel height of one hour row in the week / day time grids. */
const HOUR_PX = 44;
/** Minimum block height so a zero-duration schedule is still clickable. */
const MIN_BLOCK_PX = 20;

/** One materialized fire time of a schedule, plus the data its block renders. */
interface Occurrence {
  schedule: ScheduledTask;
  date: Date;
  status: OccurrenceStatus;
  stats: ScheduleStats;
}

/** Resolves a schedule's agent preset → glyph + name for a block. */
type AgentLookup = Map<string, AgentPreset>;

/** Pick a glyph for an agent binary (lucide has no brand marks). */
function agentIcon(binary?: string) {
  const b = (binary ?? "").toLowerCase();
  if (b === "myra-embedded") return MyraMark;
  if (b.includes("opencode")) return BotIcon;
  return TerminalIcon;
}

/** Semantic colour of a block, keyed by status (issue #181 colour legend). */
const STATUS_STYLE: Record<OccurrenceStatus, { dot: string; block: string; accent: string }> = {
  completed: { dot: "bg-task-status-done", block: "bg-task-status-done/10", accent: "border-l-task-status-done" },
  failed: { dot: "bg-destructive", block: "bg-destructive/10", accent: "border-l-destructive" },
  running: {
    dot: "bg-task-status-running",
    block: "bg-task-status-running/10",
    accent: "border-l-task-status-running",
  },
  never: { dot: "bg-task-status-backlog", block: "bg-secondary/60", accent: "border-l-task-status-backlog" },
  paused: { dot: "bg-task-status-backlog", block: "bg-secondary/40", accent: "border-l-border" },
};

export function ScheduleCalendar({ schedules, cards }: { schedules: ScheduledTask[]; cards: KanbanCard[] }) {
  const t = useTranslations("schedules");
  const router = useRouter();
  const { settings } = useSettings();

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [hidePaused, setHidePaused] = useState(false);

  const agentById = useMemo<AgentLookup>(() => new Map(settings.agents.map((p) => [p.id, p])), [settings.agents]);
  const stats = useMemo(() => buildScheduleStats(cards), [cards]);
  const { from, to } = useMemo(() => viewRange(view, anchor), [view, anchor]);

  // Expand every (optionally: every non-paused) schedule into fire times inside
  // the visible window, tagged with the data its block paints.
  const occurrences = useMemo<Occurrence[]>(() => {
    const list: Occurrence[] = [];
    for (const schedule of schedules) {
      if (hidePaused && !schedule.enabled) continue;
      const s = statsForSchedule(stats, schedule);
      const status = occurrenceStatus(schedule.enabled, s);
      for (const date of expandOccurrences(schedule.schedule, from, to)) {
        list.push({ schedule, date, status, stats: s });
      }
    }
    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [schedules, hidePaused, stats, from, to]);

  const openSchedule = (schedule: ScheduledTask) =>
    router.push(`/schedules/edit/?id=${encodeURIComponent(schedule.id)}`);

  const shift = (dir: -1 | 1) => {
    setAnchor((prev) => {
      const d = new Date(prev);
      if (view === "day") d.setDate(d.getDate() + dir);
      else if (view === "week") d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const periodLabel = useMemo(() => periodLabelFor(view, anchor), [view, anchor]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex w-full flex-col">
        {/* Toolbar: view switcher · prev/today/next · period · hide-paused */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as CalendarView)}
            className="rounded-md border border-border-cards bg-card-background p-0.5"
          >
            {(["month", "week", "day"] as const).map((v) => (
              <ToggleGroupItem
                key={v}
                value={v}
                aria-label={t(`calendar.views.${v}`)}
                className="h-6 rounded px-2.5 text-xs data-[state=on]:bg-secondary data-[state=on]:text-text-primary"
              >
                {t(`calendar.views.${v}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shift(-1)}
                aria-label={t("calendar.prev")}
                className="flex size-6 items-center justify-center rounded-md text-icon-tertiary transition-colors hover:bg-secondary hover:text-icon-primary"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setAnchor(new Date())}
                className="h-6 rounded-md border border-border-cards px-2.5 text-text-secondary text-xs transition-colors hover:bg-secondary hover:text-text-primary"
              >
                {t("calendar.today")}
              </button>
              <button
                type="button"
                onClick={() => shift(1)}
                aria-label={t("calendar.next")}
                className="flex size-6 items-center justify-center rounded-md text-icon-tertiary transition-colors hover:bg-secondary hover:text-icon-primary"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
            <span className="min-w-40 text-right text-text-primary text-xs font-medium capitalize sm:min-w-48">
              {periodLabel}
            </span>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between gap-3">
          <StatusLegend />
          <label className="flex cursor-pointer items-center gap-1.5 text-text-tertiary text-xs">
            <input
              type="checkbox"
              checked={hidePaused}
              onChange={(e) => setHidePaused(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            {t("calendar.hidePaused")}
          </label>
        </div>

        {view === "month" ? (
          <MonthGrid
            from={from}
            occurrences={occurrences}
            anchorMonth={anchor.getMonth()}
            agentById={agentById}
            onOpen={openSchedule}
          />
        ) : (
          <TimeGrid
            from={from}
            days={view === "week" ? 7 : 1}
            occurrences={occurrences}
            agentById={agentById}
            onOpen={openSchedule}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ── month ──────────────────────────────────────────────────────────────────────

function MonthGrid({
  from,
  occurrences,
  anchorMonth,
  agentById,
  onOpen,
}: {
  from: Date;
  occurrences: Occurrence[];
  anchorMonth: number;
  agentById: AgentLookup;
  onOpen: (s: ScheduledTask) => void;
}) {
  const t = useTranslations("schedules");
  const today = new Date();
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const byDay = groupByDay(occurrences);
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek(new Date()), i).toLocaleDateString(undefined, { weekday: "short" }),
  );

  return (
    <div className="overflow-hidden rounded-card border border-border-cards bg-card-background">
      <div className="grid grid-cols-7 border-border-cards border-b">
        {weekdayNames.map((name) => (
          <div key={name} className="px-2 py-1.5 text-text-tertiary text-[11px] font-medium capitalize">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = dayKey(day);
          const items = byDay.get(key) ?? [];
          const outside = day.getMonth() !== anchorMonth;
          const isToday = sameDay(day, today);
          const dense = items.length > DENSITY_LIMIT;
          const shown = items.slice(0, 3);
          return (
            <div
              key={key}
              className={cn(
                "min-h-[104px] border-border-cards border-r border-b p-1.5",
                i % 7 === 6 && "border-r-0",
                outside && "bg-secondary/20",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[11px]",
                    isToday ? "bg-primary font-medium text-primary-foreground" : "text-text-tertiary",
                    outside && !isToday && "opacity-50",
                  )}
                >
                  {day.getDate()}
                </span>
                {dense && <DensityBadge count={items.length} />}
              </div>
              <div className="flex flex-col gap-1">
                {shown.map((o) => (
                  <CompactBlock
                    key={`${o.schedule.id}-${o.date.getTime()}`}
                    occ={o}
                    agentById={agentById}
                    onOpen={onOpen}
                  />
                ))}
                {items.length > shown.length && (
                  <span className="pl-1 text-text-tertiary text-[10px]">
                    {t("calendar.more", { n: items.length - shown.length })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A one-line block used in month day-cells: time · agent icon · name. */
function CompactBlock({
  occ,
  agentById,
  onOpen,
}: {
  occ: Occurrence;
  agentById: AgentLookup;
  onOpen: (s: ScheduledTask) => void;
}) {
  const style = STATUS_STYLE[occ.status];
  const Icon = agentIcon(agentById.get(occ.schedule.agentPresetId ?? "")?.binary);
  return (
    <BlockTooltip occ={occ} agentById={agentById}>
      <button
        type="button"
        onClick={() => onOpen(occ.schedule)}
        className={cn(
          "flex w-full items-center gap-1 overflow-hidden rounded-[4px] border-l-2 py-0.5 pr-1 pl-1 text-left transition-[filter] hover:brightness-95",
          style.block,
          style.accent,
          occ.status === "paused" && "opacity-60",
        )}
      >
        <span className="shrink-0 text-text-tertiary text-[9px] tabular-nums">{formatHm(occ.date)}</span>
        <Icon className="size-2.5 shrink-0 text-icon-secondary" />
        <span className="truncate text-text-primary text-[10px]">{occ.schedule.name}</span>
      </button>
    </BlockTooltip>
  );
}

// ── week / day (time grid) ──────────────────────────────────────────────────────

function TimeGrid({
  from,
  days,
  occurrences,
  agentById,
  onOpen,
}: {
  from: Date;
  days: number;
  occurrences: Occurrence[];
  agentById: AgentLookup;
  onOpen: (s: ScheduledTask) => void;
}) {
  const today = new Date();
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const byDay = groupByDay(occurrences);

  return (
    <div className="overflow-hidden rounded-card border border-border-cards bg-card-background">
      {/* Day header row */}
      <div className="flex border-border-cards border-b">
        <div className="w-12 shrink-0 border-border-cards border-r" />
        {dayList.map((day) => {
          const isToday = sameDay(day, today);
          return (
            <div key={dayKey(day)} className="flex-1 border-border-cards border-r py-1.5 text-center last:border-r-0">
              <div className="text-text-tertiary text-[11px] capitalize">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div
                className={cn(
                  "mx-auto flex size-6 items-center justify-center rounded-full text-xs",
                  isToday ? "bg-primary font-medium text-primary-foreground" : "text-text-secondary",
                )}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      {/* Scrollable hour body (default-scrolled to ~7am) */}
      <div
        className="max-h-[560px] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={(el) => {
          if (el && el.scrollTop === 0) el.scrollTop = 7 * HOUR_PX;
        }}
      >
        <div className="flex">
          {/* Hour gutter */}
          <div className="w-12 shrink-0 border-border-cards border-r">
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_PX }}>
                <span className="-top-1.5 absolute right-1.5 text-text-tertiary text-[10px] tabular-nums">
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>
          {/* Day columns */}
          {dayList.map((day) => {
            const items = byDay.get(dayKey(day)) ?? [];
            const lanes = packLanes(items);
            const laneCount = Math.max(1, ...lanes.map((l) => l.lane + 1));
            return (
              <div
                key={dayKey(day)}
                className="relative flex-1 border-border-cards border-r last:border-r-0"
                style={{ height: 24 * HOUR_PX }}
              >
                {/* Hour gridlines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-border-cards/60 border-t"
                    style={{ top: h * HOUR_PX }}
                  />
                ))}
                {/* Now indicator */}
                {sameDay(day, today) && <NowLine now={today} />}
                {/* Event blocks */}
                {lanes.map(({ occ, lane }) => (
                  <TimeBlock
                    key={`${occ.schedule.id}-${occ.date.getTime()}`}
                    occ={occ}
                    lane={lane}
                    laneCount={laneCount}
                    agentById={agentById}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A positioned, duration-tall block in the week/day time grid. */
function TimeBlock({
  occ,
  lane,
  laneCount,
  agentById,
  onOpen,
}: {
  occ: Occurrence;
  lane: number;
  laneCount: number;
  agentById: AgentLookup;
  onOpen: (s: ScheduledTask) => void;
}) {
  const style = STATUS_STYLE[occ.status];
  const Icon = agentIcon(agentById.get(occ.schedule.agentPresetId ?? "")?.binary);
  const minutes = occ.date.getHours() * 60 + occ.date.getMinutes();
  const top = (minutes / 60) * HOUR_PX;
  const durMin = occ.stats.avgDurationSec > 0 ? occ.stats.avgDurationSec / 60 : 0;
  const height = Math.max(MIN_BLOCK_PX, Math.min((durMin / 60) * HOUR_PX, 6 * HOUR_PX));
  const widthPct = 100 / laneCount;
  return (
    <BlockTooltip occ={occ} agentById={agentById}>
      <button
        type="button"
        onClick={() => onOpen(occ.schedule)}
        className={cn(
          "absolute overflow-hidden rounded-[4px] border border-border-cards/60 border-l-2 px-1 py-0.5 text-left transition-[filter] hover:brightness-95",
          style.block,
          style.accent,
          occ.status === "paused" && "opacity-60",
        )}
        style={{
          top,
          height,
          left: `calc(${lane * widthPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
        }}
      >
        <span className="flex items-center gap-1">
          <Icon className="size-2.5 shrink-0 text-icon-secondary" />
          <span className="truncate text-text-primary text-[10px] leading-tight">{occ.schedule.name}</span>
        </span>
        {height > MIN_BLOCK_PX + 8 && (
          <span className="block truncate text-text-tertiary text-[9px] tabular-nums">
            {formatHm(occ.date)}
            {occ.stats.avgDurationSec > 0 && ` · ${formatDurationShort(occ.stats.avgDurationSec)}`}
          </span>
        )}
      </button>
    </BlockTooltip>
  );
}

// ── shared block tooltip ─────────────────────────────────────────────────────────

function BlockTooltip({
  occ,
  agentById,
  children,
}: {
  occ: Occurrence;
  agentById: AgentLookup;
  children: React.ReactNode;
}) {
  const t = useTranslations("schedules");
  const agent = agentById.get(occ.schedule.agentPresetId ?? "");
  const { stats } = occ;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="flex max-w-56 flex-col gap-1 bg-foreground text-background">
        <span className="font-medium text-xs">{occ.schedule.name}</span>
        <span className="text-[11px] text-background/70">{describeSchedule(occ.schedule.schedule)}</span>
        <div className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-background/80">
          <TipRow label={t("calendar.tip.agent")} value={agent?.name ?? t("noAgent")} />
          <TipRow label={t("calendar.tip.lastRun")} value={t(`calendar.status.${occ.status}`)} />
          {stats.runs > 0 ? (
            <>
              <TipRow
                label={t("calendar.tip.successRate")}
                value={`${Math.round(stats.successRate * 100)}% (${stats.runs})`}
              />
              {stats.avgDurationSec > 0 && (
                <TipRow label={t("calendar.tip.avgDuration")} value={formatDurationShort(stats.avgDurationSec)} />
              )}
              {stats.avgTokens > 0 && (
                <TipRow label={t("calendar.tip.avgTokens")} value={Math.round(stats.avgTokens).toLocaleString()} />
              )}
              {stats.avgCost > 0 && <TipRow label={t("calendar.tip.avgCost")} value={`$${stats.avgCost.toFixed(3)}`} />}
            </>
          ) : (
            <span className="text-background/60">{t("calendar.tip.noRuns")}</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── small presentational helpers ───────────────────────────────────────────────

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center justify-between gap-3">
      <span className="text-background/60">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function DensityBadge({ count }: { count: number }) {
  const t = useTranslations("schedules");
  return (
    <span
      title={t("calendar.densityWarning", { n: count })}
      className="flex items-center gap-0.5 rounded-full bg-task-status-running/15 px-1 text-[9px] text-task-status-running"
    >
      <TriangleAlertIcon className="size-2.5" />
      {count}
    </span>
  );
}

function StatusLegend() {
  const t = useTranslations("schedules");
  const items: OccurrenceStatus[] = ["completed", "failed", "running", "never", "paused"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-text-tertiary text-[11px]">
          <span className={cn("size-2 rounded-full", STATUS_STYLE[s].dot)} />
          {t(`calendar.status.${s}`)}
        </span>
      ))}
    </div>
  );
}

/** Red "now" line across a day column in the time grid. */
function NowLine({ now }: { now: Date }) {
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top }}>
      <div className="relative border-destructive border-t">
        <span className="-left-0.5 -top-[3px] absolute size-1.5 rounded-full bg-destructive" />
      </div>
    </div>
  );
}

// ── pure date / layout helpers ──────────────────────────────────────────────────

/** Monday (local, 00:00) of the ISO week `date` falls in. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (iso - 1));
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The visible half-open date window `[from, to)` for a view around `anchor`.
 *  Month pads to whole ISO weeks so the grid is always a clean 6×7. */
function viewRange(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const from = startOfWeek(first);
  return { from, to: addDays(from, 42) };
}

function periodLabelFor(view: CalendarView, anchor: Date): string {
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString(undefined, { day: "numeric", month: sameMonth ? undefined : "short" });
    const endLabel = end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupByDay(occ: Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const o of occ) {
    const key = dayKey(o.date);
    const list = map.get(key) ?? [];
    list.push(o);
    map.set(key, list);
  }
  return map;
}

/**
 * Greedy interval-graph colouring: assign each occurrence the lowest lane not
 * already taken by an earlier, still-overlapping block, so concurrent events sit
 * side-by-side instead of stacking. Blocks are treated as ~30min tall for
 * overlap purposes (they're short markers, not durations).
 */
function packLanes(items: Occurrence[]): { occ: Occurrence; lane: number }[] {
  const SLOT_MS = 30 * 60_000;
  const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
  const laneEnds: number[] = [];
  return sorted.map((occ) => {
    const start = occ.date.getTime();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = start + SLOT_MS;
    return { occ, lane };
  });
}

function formatHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Compact duration: "45s", "3m", "1h20". */
function formatDurationShort(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${String(rem).padStart(2, "0")}` : `${h}h`;
}
