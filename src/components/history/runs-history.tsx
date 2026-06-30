"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchedules } from "@/hooks/use-schedules";
import { useSettings } from "@/hooks/use-settings";
import {
  durationSeconds,
  formatDuration,
  formatElapsed,
  formatTriggered,
  type PastRun,
  pastRunsFromCards,
  TIME_RANGES,
  type TimeRange,
  withinRange,
} from "@/lib/history/past-runs";
import { cn } from "@/lib/utils";
import type { KanbanCard } from "@/types/kanban";
import type { AgentPreset } from "@/types/settings";

/**
 * The shared "History" view (Figma `history`): time-range selector → stat cards →
 * two trend graphs → searchable, sortable run table. Rendered from a set of
 * kanban cards: the standalone `/history` page passes every card; the schedule
 * editor's "Runs & History" tab passes only that schedule's cards. All copy comes
 * from the `history` i18n namespace.
 */
export function RunsHistory({
  cards,
  seeAllHref = "/schedules",
  includeLive = false,
}: {
  cards: KanbanCard[];
  seeAllHref?: string;
  /** Surface in-flight runs (running / needs_feedback / awaiting_review) as live
   *  rows. The standalone History page stays terminal-only; the Patrol editor's
   *  Operations & History tab opts in so a just-launched run shows immediately. */
  includeLive?: boolean;
}) {
  const t = useTranslations("history");
  const router = useRouter();
  const now = useNow();
  const { settings } = useSettings();
  const { schedules, triggerNow } = useSchedules();

  // Resolve the agent preset a run used (falls back to the default agent).
  const agentOf = (r: PastRun): AgentPreset | undefined =>
    settings.agents.find((a) => a.id === (r.agentPresetId ?? settings.defaultAgentId));

  const [range, setRange] = useState<TimeRange>("today");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultValue[]>([]);

  const allRuns = useMemo(() => {
    const all = pastRunsFromCards(cards);
    // Patrol "Operations & History" tab shows every run — live, awaiting-human,
    // and finished. The standalone History page shows only runs with a final
    // verdict (completed / failed); anything not yet "Done" is filtered out.
    return includeLive ? all : all.filter((r) => r.status === "completed" || r.status === "failed");
  }, [cards, includeLive]);
  const inRange = useMemo(() => allRuns.filter((r) => withinRange(r, range, now)), [allRuns, range, now]);

  const stats = useMemo(() => {
    const total = inRange.length;
    const success = inRange.filter((r) => r.ok).length;
    // Failures are explicit failures only — live, awaiting_review and
    // needs_feedback runs are neither success nor failure.
    const failed = inRange.filter((r) => r.status === "failed").length;
    const tokens = inRange.reduce((sum, r) => sum + (r.tokens ?? 0), 0);
    return { total, success, failed, tokens };
  }, [inRange]);

  const buckets = useMemo(() => buildBuckets(inRange, range, now), [inRange, range, now]);

  const rows = useMemo(() => {
    let r = inRange;
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((run) => run.cardTitle.toLowerCase().includes(q));
    if (resultFilter.length) r = r.filter((run) => resultFilter.includes(resultValueOf(run)));
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const nameOf = (run: PastRun) =>
        settings.agents.find((a) => a.id === (run.agentPresetId ?? settings.defaultAgentId))?.name ?? "";
      r = [...r].sort((a, b) =>
        sort.key === "agent" ? dir * nameOf(a).localeCompare(nameOf(b)) : dir * compareRuns(sort.key, a, b),
      );
    }
    return r;
  }, [inRange, query, resultFilter, sort, settings]);

  const narrowed = query.trim().length > 0 || resultFilter.length > 0;
  const toggleResultFilter = (v: ResultValue) =>
    setResultFilter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const VISIBLE = 4;
  const visibleRows = rows.slice(0, VISIBLE);
  const rangeLabel = t(`ranges.${range}`);

  // A live (still-running) operation opens its Operations detail — the
  // "Operations › {title}" live view at `/logs` (Stop / live output). A finished
  // run opens its History detail at `/history/run`.
  const openRun = (r: PastRun) =>
    r.live
      ? router.push(`/logs/?card=${encodeURIComponent(r.cardId)}`)
      : router.push(`/history/run/?card=${encodeURIComponent(r.cardId)}&run=${encodeURIComponent(r.runId)}`);
  const editPatrol = (r: PastRun) => {
    if (r.linkedTaskId) router.push(`/schedules/edit/?id=${encodeURIComponent(r.linkedTaskId)}`);
  };
  // Re-fire the owning patrol now. Schedule ids are connection-scoped while the
  // run stores the raw task id — match on suffix too (mirrors the session view).
  const rerun = async (r: PastRun) => {
    const linked = r.linkedTaskId;
    if (!linked) return;
    const schedule = schedules.find((s) => s.id === linked || s.id.endsWith(`:${linked}`) || s.id.endsWith(linked));
    if (!schedule) return;
    try {
      await triggerNow(schedule.id);
      toast.success(t("rowMenu.rerunStarted"));
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="flex w-full flex-col">
      {/* Time-range selector */}
      <div className="flex items-center gap-2.5 pb-1.5">
        {TIME_RANGES.map((r) => {
          const active = range === r;
          return (
            <button
              type="button"
              key={r}
              aria-pressed={active}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-[10px] px-2 py-[3px] text-xs transition-colors",
                active ? "bg-secondary text-text-primary" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t(`ranges.${r}`)}
            </button>
          );
        })}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard title={t("stats.total")} value={String(stats.total)} />
        <StatCard title={t("stats.success", { range: rangeLabel })} value={String(stats.success)} accent="ok" />
        <StatCard title={t("stats.failed", { range: rangeLabel })} value={String(stats.failed)} accent="fail" />
        <StatCard title={t("stats.tokens")} value={stats.tokens > 0 ? stats.tokens.toLocaleString() : "—"} />
      </div>

      {/* Trend graphs */}
      <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <GraphCard label={t("graph1")}>
          <RunsBarChart data={buckets} />
        </GraphCard>
        <GraphCard label={t("graph2")}>
          <SuccessRateChart data={buckets} />
        </GraphCard>
      </div>

      {/* Global text search */}
      <div className="mt-10 flex items-center justify-end gap-2 text-icon-tertiary">
        {searchOpen ? (
          <div className="flex h-4 items-center gap-1.5">
            <SearchIcon className="size-4 shrink-0" />
            <input
              ref={(el) => el?.focus()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  setSearchOpen(false);
                }
              }}
              onBlur={() => {
                if (!query.trim()) setSearchOpen(false);
              }}
              placeholder={t("searchPlaceholder")}
              className="w-40 bg-transparent text-text-primary text-xs outline-none placeholder:text-text-tertiary"
              aria-label={t("search")}
            />
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
              className="shrink-0 transition-colors hover:text-icon-primary"
              aria-label={t("clearFilters")}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="transition-colors hover:text-icon-primary"
            aria-label={t("search")}
          >
            <SearchIcon className="size-4" />
          </button>
        )}
      </div>

      {/* Count line */}
      <p className="mt-2 text-right font-light text-text-tertiary text-xs">
        {t("showing", { shown: visibleRows.length, total: rows.length })}
      </p>

      {/* Run table */}
      <div className="mt-2.5 overflow-hidden rounded-[10px] border border-border-cards bg-card-background">
        <Table>
          <TableHeader>
            <TableRow className="border-border-cards hover:bg-transparent">
              <ColHead label={t("columns.task")} sortKey="task" sort={sort} setSort={setSort} className="pl-[9px]" />
              <ColHead
                label={t("columns.triggered")}
                sortKey="triggered"
                sort={sort}
                setSort={setSort}
                className="w-[180px]"
              />
              <ColHead
                label={t("columns.duration")}
                sortKey="duration"
                sort={sort}
                setSort={setSort}
                className="w-[120px]"
              />
              <ColHead label={t("columns.agent")} sortKey="agent" sort={sort} setSort={setSort} className="w-[150px]" />
              <ColHead
                label={t("columns.result")}
                sortKey="result"
                sort={sort}
                setSort={setSort}
                className="w-[120px]"
                filter={{
                  options: [
                    { value: "success", label: t("result.success"), dot: "bg-task-status-done" },
                    { value: "failed", label: t("result.failed"), dot: "bg-destructive" },
                    ...(includeLive
                      ? [{ value: "running", label: t("result.running"), dot: "bg-task-status-running" }]
                      : []),
                  ],
                  selected: resultFilter,
                  onToggle: (v) => toggleResultFilter(v as ResultValue),
                  onClear: () => setResultFilter([]),
                }}
              />
              <ColHead label={t("columns.usage")} sortKey="usage" sort={sort} setSort={setSort} className="w-[140px]" />
              <TableHead className="h-10 w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow className="border-border-cards hover:bg-transparent">
                <TableCell colSpan={7} className="h-24 text-center text-sm">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-text-tertiary">{narrowed ? t("noResults") : t("empty")}</span>
                    {narrowed && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setSearchOpen(false);
                          setResultFilter([]);
                          setSort(null);
                        }}
                        className="text-text-secondary text-xs underline-offset-2 transition-colors hover:text-text-primary hover:underline"
                      >
                        {t("clearFilters")}
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((r) => (
                <TableRow
                  key={`${r.cardId}:${r.runId}`}
                  className="cursor-pointer border-border-cards hover:bg-secondary/40"
                  onClick={() => openRun(r)}
                >
                  <TableCell className="max-w-[280px] truncate pl-[9px] text-text-secondary text-xs">
                    <span className="flex items-center gap-1.5">
                      {r.archived && (
                        <ArchiveIcon className="size-3 shrink-0 text-text-tertiary" aria-label={t("archived")} />
                      )}
                      <span className="truncate">{r.cardTitle}</span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-text-secondary text-xs">
                    {formatTriggered(r.startedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-text-secondary text-xs tabular-nums">
                    {r.live ? formatElapsed(r.startedAt, now) : formatDuration(r)}
                  </TableCell>
                  <TableCell>
                    <AgentChip agent={agentOf(r)} />
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap text-xs", RESULT_STYLE[resultValueOf(r)].className)}>
                    <span className="inline-flex items-center gap-1.5">
                      {r.live && (
                        <span className="size-1.5 animate-pulse rounded-full bg-task-status-running" aria-hidden />
                      )}
                      {t(RESULT_STYLE[resultValueOf(r)].labelKey)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-text-secondary text-xs tabular-nums">
                    {r.tokens != null ? t("usage", { tokens: r.tokens }) : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded p-1 text-icon-tertiary transition hover:text-icon-primary"
                          aria-label={t("rowMenu.open")}
                        >
                          <MoreHorizontalIcon className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openRun(r)} className="whitespace-nowrap">
                          {t("rowMenu.viewOperation")}
                        </DropdownMenuItem>
                        {/* Patrol actions need an owning schedule — disable when the run
                            isn't linked to one (e.g. a one-off / manual card). */}
                        <DropdownMenuItem
                          disabled={!r.linkedTaskId}
                          onClick={() => editPatrol(r)}
                          className="whitespace-nowrap"
                        >
                          {t("rowMenu.editPatrol")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!r.linkedTaskId}
                          onClick={() => void rerun(r)}
                          className="whitespace-nowrap"
                        >
                          {t("rowMenu.rerun")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {rows.length > VISIBLE && (
          <button
            type="button"
            onClick={() => router.push(seeAllHref)}
            className="w-full border-border-cards border-t py-[7px] text-center font-light text-text-tertiary text-xs transition-colors hover:text-text-secondary"
          >
            {t("footer", { shown: visibleRows.length, total: rows.length })}
          </button>
        )}
      </div>
    </div>
  );
}

// ── internals ────────────────────────────────────────────────────────────────

/** Stable "now" for the lifetime of the view (static export has no server time). */
function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
  return now;
}

type Bucket = { key: string; label: string; ok: number; failed: number };

function buildBuckets(runs: PastRun[], range: TimeRange, now: number): Bucket[] {
  const day = 86_400_000;
  const hour = 3_600_000;
  const start0 = new Date(now);
  start0.setHours(0, 0, 0, 0);

  const starts: number[] = [];
  const buckets: Bucket[] = [];
  let span: number;

  if (range === "today") {
    // Hourly buckets so a single day reads as a distribution, not one full-width block.
    span = hour;
    for (let h = 0; h < 24; h++) {
      const s = start0.getTime() + h * hour;
      starts.push(s);
      buckets.push({ key: `h${h}`, label: `${String(h).padStart(2, "0")}:00`, ok: 0, failed: 0 });
    }
  } else {
    let windowDays: number;
    if (range === "7d") windowDays = 7;
    else if (range === "14d") windowDays = 14;
    else if (range === "30d") windowDays = 30;
    else {
      const earliest = runs.reduce((m, r) => Math.min(m, Date.parse(r.startedAt)), now);
      windowDays = Math.min(365, Math.max(1, Math.ceil((start0.getTime() - earliest) / day) + 1));
    }

    const step = windowDays > 31 ? 7 : 1;
    span = step * day;
    const count = Math.ceil(windowDays / step);
    const lastStart = start0.getTime() - (step - 1) * day;
    for (let i = count - 1; i >= 0; i--) {
      const s = lastStart - i * span;
      starts.push(s);
      buckets.push({
        key: new Date(s).toISOString().slice(0, 10),
        label: new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        ok: 0,
        failed: 0,
      });
    }
  }

  for (const r of runs) {
    // Only resolved outcomes feed the trend — skip live / awaiting_review /
    // needs_feedback runs that have no pass-or-fail verdict yet.
    if (!r.ok && r.status !== "failed") continue;
    const ts = Date.parse(r.startedAt);
    for (let i = 0; i < starts.length; i++) {
      if (ts >= starts[i] && ts < starts[i] + span) {
        if (r.ok) buckets[i].ok += 1;
        else buckets[i].failed += 1;
        break;
      }
    }
  }
  return buckets;
}

function RunsBarChart({ data }: { data: Bucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.ok + d.failed));
  return (
    <div className="flex h-full w-full items-end gap-1 overflow-hidden border-border-cards border-b">
      {data.map((d) => {
        const total = d.ok + d.failed;
        const okH = (d.ok / max) * 100;
        const failH = (d.failed / max) * 100;
        return (
          <div
            key={d.key}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${d.label}: ${d.ok}✓ ${d.failed}✗`}
          >
            {total > 0 && (
              <>
                <div className="w-full rounded-t-[2px] bg-destructive" style={{ height: `${failH}%` }} />
                <div
                  className={cn("w-full bg-task-status-done", d.failed === 0 && "rounded-t-[2px]")}
                  style={{ height: `${okH}%` }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SuccessRateChart({ data }: { data: Bucket[] }) {
  const w = 100;
  const h = 100;
  const pad = 4;
  const pts = data.map((d, i) => {
    const total = d.ok + d.failed;
    const rate = total === 0 ? null : d.ok / total;
    const x = data.length > 1 ? (i / (data.length - 1)) * w : w / 2;
    const y = rate === null ? null : pad + (1 - rate) * (h - 2 * pad);
    return { x, y, total, rate };
  });
  const line = pts
    .filter((p) => p.y !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${(p.y as number).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full overflow-hidden">
      <title>Success rate per bucket</title>
      {[0, 50, 100].map((g) => {
        const gy = pad + ((100 - g) / 100) * (h - 2 * pad);
        return <line key={g} x1={0} x2={w} y1={gy} y2={gy} className="stroke-border-cards" strokeWidth={0.5} />;
      })}
      {line && (
        <path
          d={line}
          fill="none"
          className="stroke-task-status-done"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {pts.map((p) =>
        p.y === null ? null : (
          <circle
            key={p.x}
            cx={p.x}
            cy={p.y}
            r={1.6}
            className={cn(p.rate !== null && p.rate < 0.5 ? "fill-destructive" : "fill-task-status-done")}
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </svg>
  );
}

type SortKey = "task" | "triggered" | "duration" | "agent" | "result" | "usage";
type SortDir = "asc" | "desc";
type ResultValue = "success" | "failed" | "running" | "review" | "feedback";

/** Result bucket for a run. Live runs are still executing; awaiting_review /
 *  needs_feedback have ended but await a human, so they're neither pass nor fail. */
function resultValueOf(run: PastRun): ResultValue {
  if (run.live) return "running";
  switch (run.status) {
    case "completed":
      return "success";
    case "awaiting_review":
      return "review";
    case "needs_feedback":
      return "feedback";
    default:
      // `failed`, or a stale `running` that ended without completing.
      return "failed";
  }
}

/** Tailwind text color + i18n key for each result bucket. */
const RESULT_STYLE: Record<ResultValue, { className: string; labelKey: string }> = {
  running: { className: "text-task-status-running", labelKey: "result.running" },
  success: { className: "text-task-status-done", labelKey: "result.success" },
  failed: { className: "text-destructive", labelKey: "result.failed" },
  review: { className: "text-task-status-needs-you", labelKey: "result.awaitingReview" },
  feedback: { className: "text-task-status-needs-you", labelKey: "result.needsYou" },
};

function compareRuns(key: SortKey, a: PastRun, b: PastRun): number {
  switch (key) {
    case "task":
      return a.cardTitle.localeCompare(b.cardTitle);
    case "triggered":
      return a.startedAt.localeCompare(b.startedAt);
    case "duration":
      return durationSeconds(a) - durationSeconds(b);
    case "result":
      return Number(a.ok) - Number(b.ok);
    case "usage":
      return (a.tokens ?? -1) - (b.tokens ?? -1);
    case "agent":
      // Resolved name needs settings; handled at the call site. Keep stable here.
      return 0;
  }
}

function ColHead({
  label,
  sortKey,
  sort,
  setSort,
  filter,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  setSort: (next: { key: SortKey; dir: SortDir } | null) => void;
  filter?: {
    options: { value: string; label: string; dot?: string }[];
    selected: string[];
    onToggle: (value: string) => void;
    onClear: () => void;
  };
  className?: string;
}) {
  const t = useTranslations("history");
  const sorted = sort?.key === sortKey;
  const hasFilter = (filter?.selected.length ?? 0) > 0;
  const active = sorted || hasFilter;
  const applySort = (dir: SortDir) => setSort(sorted && sort?.dir === dir ? null : { key: sortKey, dir });

  return (
    <TableHead className={cn("group/col h-10 font-normal text-text-primary text-xs", className)}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {sorted && (
            <button
              type="button"
              onClick={() => applySort(sort?.dir === "asc" ? "desc" : "asc")}
              aria-label={t(sort?.dir === "asc" ? "sort.desc" : "sort.asc")}
              className="rounded p-0.5 text-icon-primary transition"
            >
              {sort?.dir === "asc" ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("columnMenu", { column: label })}
                className={cn(
                  "rounded p-0.5 text-icon-secondary opacity-0 transition hover:text-icon-primary group-hover/col:opacity-100 data-[state=open]:opacity-100",
                  active && "text-icon-primary opacity-100",
                )}
              >
                <ListFilterIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel className="text-text-tertiary text-xs">{t("sort.label")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => applySort("asc")}>
                <ArrowUpIcon className="size-3.5" />
                {t("sort.asc")}
                {sorted && sort?.dir === "asc" && <CheckIcon className="ml-auto size-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => applySort("desc")}>
                <ArrowDownIcon className="size-3.5" />
                {t("sort.desc")}
                {sorted && sort?.dir === "desc" && <CheckIcon className="ml-auto size-3.5" />}
              </DropdownMenuItem>
              {sorted && (
                <DropdownMenuItem className="text-text-tertiary" onClick={() => setSort(null)}>
                  {t("sort.clear")}
                </DropdownMenuItem>
              )}
              {filter && filter.options.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-text-tertiary text-xs">{t("filterBy")}</DropdownMenuLabel>
                  {filter.options.map((o) => (
                    <DropdownMenuCheckboxItem
                      key={o.value}
                      checked={filter.selected.includes(o.value)}
                      onCheckedChange={() => filter.onToggle(o.value)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="flex items-center gap-1.5">
                        {o.dot && <span className={cn("size-2 rounded-full", o.dot)} />}
                        {o.label}
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  {hasFilter && (
                    <DropdownMenuItem className="text-text-tertiary" onClick={filter.onClear}>
                      {t("clearColumnFilter")}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TableHead>
  );
}

function StatCard({ title, value, accent }: { title: string; value: string; accent?: "ok" | "fail" }) {
  return (
    <div className="flex h-16 flex-col justify-center gap-1.5 rounded-[10px] border border-border-cards bg-card-background px-[18px]">
      <span className="font-medium text-text-secondary text-xs leading-none">{title}</span>
      <span
        className={cn(
          "text-base tabular-nums leading-none",
          accent === "ok" ? "text-task-status-done" : accent === "fail" ? "text-destructive" : "text-text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Pick a lucide glyph for the agent binary (no brand marks in lucide). */
function agentIcon(binary: string) {
  return binary.toLowerCase().includes("opencode") ? BotIcon : TerminalIcon;
}

/** A bordered chip with the agent's icon + name, mirroring the Operations Agent cell. */
function AgentChip({ agent }: { agent?: AgentPreset }) {
  if (!agent) return <span className="text-text-tertiary text-xs">—</span>;
  const Icon = agentIcon(agent.binary);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-cards px-2 py-1 text-text-secondary text-xs">
      <Icon className="size-3.5 text-icon-primary" />
      {agent.name}
    </span>
  );
}

function GraphCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-[120px] flex-col gap-2 overflow-hidden rounded-[10px] border border-border-cards bg-card-background p-4">
      <span className="font-medium text-text-secondary text-xs">{label}</span>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
