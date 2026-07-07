"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCwIcon,
  SearchIcon,
  Settings2Icon,
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
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type HistoryColumnId, TOGGLEABLE_COLUMNS, useHistoryColumns } from "@/hooks/use-history-columns";
import { useRunStartedToast } from "@/hooks/use-run-started-toast";
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
  includeLive = false,
}: {
  cards: KanbanCard[];
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
  const showRunStarted = useRunStartedToast();
  const { hidden, toggleColumn, resetColumns } = useHistoryColumns();

  // Resolve the agent preset a run used (falls back to the default agent).
  const agentOf = (r: PastRun): AgentPreset | undefined =>
    settings.agents.find((a) => a.id === (r.agentPresetId ?? settings.defaultAgentId));

  // Default to "all" so older runs still awaiting the human (e.g. an
  // awaiting_review run from yesterday) aren't hidden by a narrow date window —
  // the Operations page lists them, History/Patrol tab should match.
  const [range, setRange] = useState<TimeRange>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [resultFilter, setResultFilter] = useState<ResultValue[]>([]);
  const [statsVisible, setStatsVisible] = useState(true);

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
    // Failures are explicit failures only — live, awaiting_review, needs_feedback
    // and cancelled runs are neither success nor failure.
    const failed = inRange.filter((r) => r.status === "failed" && !r.canceled).length;
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

  // Scroll pagination: render a page of rows, grow it as a sentinel below the
  // table scrolls into view. Reset to the first page whenever the filtered set
  // changes (range / search / column filter / sort) so we never start scrolled.
  const PAGE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on any input that reshapes `rows`.
  useEffect(() => setVisibleCount(PAGE), [range, query, resultFilter, sort, cards]);
  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Cap the list to the space left below it inside its scroll container, so
  // everything above (stats/graphs here, plus the whole Patrol form when
  // embedded) AND the padding below it (the editor's `pb-10`, the layout's
  // content padding) are accounted for: the list fills to the bottom without
  // ever pushing the page past the fold. Recomputed on resize / content change.
  const [listMaxH, setListMaxH] = useState<number>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: statsVisible reshapes content above the list — recompute on toggle.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollParent = (() => {
      let n = el.parentElement;
      while (n) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === "auto" || oy === "scroll") return n;
        n = n.parentElement;
      }
      return document.documentElement;
    })();
    const compute = () => {
      const parentRect = scrollParent.getBoundingClientRect();
      // Bottom of the scroll parent's content box (stable — independent of the
      // list's own height, unlike scrollHeight which collapses to clientHeight
      // when the content fits and would pin the list to its current size).
      const visibleBottom = parentRect.top + scrollParent.clientHeight;
      // Everything in flow BELOW the list up to the scroll parent: each level's
      // following siblings + each ancestor's bottom padding (the editor's
      // `pb-10`, the layout's content padding…). Absolutely-positioned siblings
      // (the fade/chevron overlay) take no flow space, so skip them. Also stable.
      let reserve = 0;
      let node: HTMLElement | null = el;
      while (node && node !== scrollParent) {
        for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
          const cs = getComputedStyle(sib);
          if (cs.position !== "absolute" && cs.position !== "fixed") reserve += sib.getBoundingClientRect().height;
        }
        const up: HTMLElement | null = node.parentElement;
        if (up) reserve += Number.parseFloat(getComputedStyle(up).paddingBottom) || 0;
        node = up;
      }
      const available = visibleBottom - el.getBoundingClientRect().top - reserve - 2;
      setListMaxH((prev) => {
        const next = Math.max(200, available);
        return prev != null && Math.abs(prev - next) <= 1 ? prev : next;
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(document.body);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [statsVisible]);

  // Scroll affordance: fade the top/bottom edges + show a bounced chevron
  // whenever rows lie above/below the visible viewport. Recomputed on scroll
  // and whenever the list height / row count change.
  const [moreBelow, setMoreBelow] = useState(false);
  const [moreAbove, setMoreAbove] = useState(false);
  const updateMoreBelow = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Tolerance guards against sub-pixel rounding + the sticky affordance's own
    // box, which would otherwise report a phantom overflow when the rows fit
    // exactly (e.g. a single row) and wrongly show the bouncing chevron.
    const EPS = 8;
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - EPS);
    setMoreAbove(el.scrollTop > EPS);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure after layout settles.
  useEffect(updateMoreBelow, [listMaxH, visibleCount, rows.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    // Observe within the table's own scroll container (the page itself never
    // scrolls), preloading the next page 200px before the sentinel appears.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => Math.min(c + PAGE, rows.length));
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, rows.length]);
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
      const runId = await triggerNow(schedule.id);
      showRunStarted(runId, t("rowMenu.rerunStarted"));
    } catch (e) {
      toast.error(String(e));
    }
  };

  // Column descriptors — one source of truth for the split header/body tables
  // and the colgroup. The "task" column is the row anchor and is never hidden;
  // the rest are toggled via the columns menu and persisted by useHistoryColumns.
  const columns: ColumnDef[] = [
    {
      id: "task",
      weight: 280,
      headClassName: "pl-[9px]",
      cellClassName: "max-w-[280px] truncate pl-[9px] text-text-secondary text-xs",
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span
            role="img"
            aria-label={t(STATUS_DOT[runBucket(r)].labelKey)}
            title={t(STATUS_DOT[runBucket(r)].labelKey)}
            className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[runBucket(r)].dot)}
          />
          <span className="truncate">{r.cardTitle}</span>
        </span>
      ),
    },
    {
      id: "triggered",
      weight: 180,
      cellClassName: "whitespace-nowrap text-text-secondary text-xs",
      cell: (r) => formatTriggered(r.startedAt),
    },
    {
      id: "ended",
      weight: 180,
      cellClassName: "whitespace-nowrap text-text-secondary text-xs",
      // Unfinished runs (live / awaiting-human) have no end yet → dash.
      cell: (r) => (r.endedAt ? formatTriggered(r.endedAt) : "—"),
    },
    {
      id: "duration",
      weight: 120,
      cellClassName: "whitespace-nowrap text-text-secondary text-xs tabular-nums",
      cell: (r) => (r.live ? formatElapsed(r.startedAt, now) : formatDuration(r)),
    },
    {
      id: "agent",
      weight: 150,
      cell: (r) => <AgentChip agent={agentOf(r)} />,
    },
    {
      id: "result",
      weight: 120,
      cellClassName: (r) =>
        cn(
          "whitespace-nowrap text-xs",
          // Cancelled + unfinished runs are both muted grey; only a real verdict is coloured.
          r.canceled || !hasFinalResult(r) ? "text-text-tertiary" : RESULT_STYLE[resultValueOf(r)].className,
        ),
      // Cancelled → "Canceled"; a finished run → its verdict; otherwise a dash.
      cell: (r) =>
        r.canceled ? t("result.canceled") : hasFinalResult(r) ? t(RESULT_STYLE[resultValueOf(r)].labelKey) : "—",
      filter: {
        options: [
          { value: "success", label: t("result.success"), dot: "bg-task-status-done" },
          { value: "failed", label: t("result.failed"), dot: "bg-destructive" },
          ...(includeLive ? [{ value: "running", label: t("result.running"), dot: "bg-task-status-running" }] : []),
        ],
        selected: resultFilter,
        onToggle: (v) => toggleResultFilter(v as ResultValue),
        onClear: () => setResultFilter([]),
      },
    },
    {
      id: "usage",
      weight: 140,
      cellClassName: "whitespace-nowrap text-text-secondary text-xs tabular-nums",
      cell: (r) => (r.tokens != null ? t("usage", { tokens: r.tokens }) : "—"),
    },
  ];
  const visibleColumns = columns.filter((c) => c.id === "task" || !hidden.includes(c.id as HistoryColumnId));

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
        <button
          type="button"
          onClick={() => setStatsVisible((v) => !v)}
          aria-pressed={statsVisible}
          className="rounded-[10px] px-2 py-[3px] text-text-secondary text-xs transition-colors hover:text-text-primary"
        >
          {t(statsVisible ? "hideStats" : "showStats")}
        </button>
      </div>

      {statsVisible && (
        <>
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
        </>
      )}

      {/* Global text search + column visibility */}
      <div className={cn("flex items-center justify-end gap-2 text-icon-tertiary", statsVisible && "mt-10")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("columnsLabel")}
              className={cn("transition-colors hover:text-icon-primary", hidden.length > 0 && "text-icon-primary")}
            >
              <Settings2Icon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-text-tertiary text-xs">{t("columnsLabel")}</DropdownMenuLabel>
            {TOGGLEABLE_COLUMNS.map((id) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={!hidden.includes(id)}
                onCheckedChange={() => toggleColumn(id)}
                onSelect={(e) => e.preventDefault()}
              >
                {t(`columns.${id}`)}
              </DropdownMenuCheckboxItem>
            ))}
            {hidden.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-text-tertiary" onClick={resetColumns}>
                  {t("resetColumns")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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

      {/* Run table — content-sized, capped to the space left below it; only the
          list scrolls past the cap (the page itself does not). The column header
          stays pinned while rows scroll under it. */}
      <div className="relative mt-2.5 overflow-hidden rounded-[10px] border border-border-cards bg-card-background">
        {/* Fixed column header, kept OUTSIDE the scroller so it never moves.
            WebKit leaves a gap above a sticky <th> when an inner <table> scrolls,
            so the header and body are split into two width-synced `table-fixed`
            tables sharing <Cols/> for column alignment. */}
        <table className="w-full table-fixed">
          <Cols columns={visibleColumns} />
          <TableHeader className="[&_th]:border-border-cards [&_th]:border-b [&_th]:bg-card-background">
            <TableRow className="border-border-cards hover:bg-transparent">
              {visibleColumns.map((c) => (
                <ColHead
                  key={c.id}
                  label={t(`columns.${c.id}`)}
                  sortKey={c.id}
                  sort={sort}
                  setSort={setSort}
                  className={c.headClassName}
                  filter={c.filter}
                />
              ))}
              <TableHead className="h-10 w-10" />
            </TableRow>
          </TableHeader>
        </table>
        {/* Scrollable body — only the rows scroll, under the fixed header. */}
        <div
          ref={scrollRef}
          onScroll={updateMoreBelow}
          className="overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          // `max-height` (not height): the list sizes to its content and only
          // scrolls once it exceeds the space left below it — no empty room inside
          // the card when there are few rows.
          style={{ maxHeight: listMaxH }}
        >
          <table className="w-full table-fixed">
            <Cols columns={visibleColumns} />
            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow className="border-border-cards hover:bg-transparent">
                  <TableCell colSpan={visibleColumns.length + 1} className="h-24 text-center text-sm">
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
                    {visibleColumns.map((c) => (
                      <TableCell
                        key={c.id}
                        className={typeof c.cellClassName === "function" ? c.cellClassName(r) : c.cellClassName}
                      >
                        {c.cell(r)}
                      </TableCell>
                    ))}
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
                            <EyeIcon className="size-3.5" />
                            {t("rowMenu.viewOperation")}
                          </DropdownMenuItem>
                          {/* Patrol actions need an owning schedule — disable when the run
                            isn't linked to one (e.g. a one-off / manual card). */}
                          <DropdownMenuItem
                            disabled={!r.linkedTaskId}
                            onClick={() => editPatrol(r)}
                            className="whitespace-nowrap"
                          >
                            <PencilIcon className="size-3.5" />
                            {t("rowMenu.editPatrol")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!r.linkedTaskId}
                            onClick={() => void rerun(r)}
                            className="whitespace-nowrap"
                          >
                            <RotateCwIcon className="size-3.5" />
                            {t("rowMenu.rerun")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}
        </div>
        {/* "More above" affordance — absolute overlay on the card (NOT inside the
            scroller, so it can't inflate scrollHeight and trigger a phantom
            overflow). Sits just below the fixed header (h-10). Hidden until
            scrolled down. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-10 flex h-14 items-start justify-center bg-gradient-to-b from-card-background via-card-background/80 to-transparent transition-opacity duration-200",
            moreAbove ? "opacity-100" : "opacity-0",
          )}
        >
          <button
            type="button"
            onClick={() =>
              scrollRef.current?.scrollBy({ top: -(scrollRef.current.clientHeight * 0.6), behavior: "smooth" })
            }
            aria-label={t("scrollUp")}
            tabIndex={moreAbove ? 0 : -1}
            className="pointer-events-auto mt-1 rounded-full p-1 text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ChevronUpIcon className="size-4 [animation:myra-bounce-up-edge_1s_infinite]" />
          </button>
        </div>
        {/* "More below" affordance — fades the lower edge + a nudging chevron so
            it's obvious the list scrolls. Clicking the chevron nudges the list
            down a few rows. Hidden once scrolled to the bottom. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-card-background via-card-background/80 to-transparent transition-opacity duration-200",
            moreBelow ? "opacity-100" : "opacity-0",
          )}
        >
          <button
            type="button"
            onClick={() =>
              scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * 0.6, behavior: "smooth" })
            }
            aria-label={t("scrollDown")}
            tabIndex={moreBelow ? 0 : -1}
            className="pointer-events-auto mb-1 rounded-full p-1 text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ChevronDownIcon className="size-4 animate-bounce" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── internals ────────────────────────────────────────────────────────────────

/** Filter affordance attached to a column header (only Result uses it today). */
type ColFilter = {
  options: { value: string; label: string; dot?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
};

/** A single table column. `weight` is a relative share of the table width — the
 *  larger it is, the wider the column. `cellClassName` may depend on the row
 *  (Result colors by verdict). */
type ColumnDef = {
  id: SortKey;
  weight: number;
  headClassName?: string;
  cellClassName?: string | ((r: PastRun) => string);
  cell: (r: PastRun) => React.ReactNode;
  filter?: ColFilter;
};

/** Weight of the trailing row-actions column (the `⋯` menu). Small, so it stays
 *  a thin gutter while every other column gets the bulk of the width. */
const ACTIONS_COL_WEIGHT = 45;

/** Shared column widths for the split header + body tables, so their columns
 *  line up. Each visible column takes a share of the table width proportional to
 *  its `weight` (expressed as a percentage so table-fixed honors it — `calc()` on
 *  a `<col>` is ignored and collapses to equal columns). Hiding a column makes the
 *  rest grow to fill the gap, keeping their relative proportions. */
function Cols({ columns }: { columns: ColumnDef[] }) {
  const totalWeight = columns.reduce((sum, c) => sum + c.weight, ACTIONS_COL_WEIGHT) || 1;
  const pct = (w: number) => `${((w / totalWeight) * 100).toFixed(3)}%`;
  return (
    <colgroup>
      {columns.map((c) => (
        <col key={c.id} style={{ width: pct(c.weight) }} />
      ))}
      <col style={{ width: pct(ACTIONS_COL_WEIGHT) }} />
    </colgroup>
  );
}

/** Stable "now" for the lifetime of the view (static export has no server time). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type Bucket = { key: string; label: string; ok: number; failed: number; canceled: number };

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
      buckets.push({ key: `h${h}`, label: `${String(h).padStart(2, "0")}:00`, ok: 0, failed: 0, canceled: 0 });
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
        canceled: 0,
      });
    }
  }

  for (const r of runs) {
    // Skip runs with no terminal outcome — live / awaiting_review / needs_feedback.
    // Cancelled runs DO count (own segment), even though they have no pass/fail verdict.
    if (!r.canceled && !r.ok && r.status !== "failed") continue;
    const ts = Date.parse(r.startedAt);
    for (let i = 0; i < starts.length; i++) {
      if (ts >= starts[i] && ts < starts[i] + span) {
        if (r.canceled) buckets[i].canceled += 1;
        else if (r.ok) buckets[i].ok += 1;
        else buckets[i].failed += 1;
        break;
      }
    }
  }
  return buckets;
}

function RunsBarChart({ data }: { data: Bucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.ok + d.failed + d.canceled));
  return (
    <div className="flex h-full w-full items-end gap-1 overflow-hidden border-border-cards border-b">
      {data.map((d) => {
        const total = d.ok + d.failed + d.canceled;
        const okH = (d.ok / max) * 100;
        const failH = (d.failed / max) * 100;
        const cancelH = (d.canceled / max) * 100;
        return (
          <div
            key={d.key}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${d.label}: ${d.ok}✓ ${d.failed}✗ ${d.canceled}⊘`}
          >
            {total > 0 && (
              <>
                <div className="w-full rounded-t-[2px] bg-destructive" style={{ height: `${failH}%` }} />
                <div
                  className={cn("w-full bg-task-status-done", d.failed === 0 && "rounded-t-[2px]")}
                  style={{ height: `${okH}%` }}
                />
                {/* Cancelled runs — darker grey base segment (no pass/fail verdict). */}
                <div
                  className={cn("w-full bg-muted-foreground", d.failed === 0 && d.ok === 0 && "rounded-t-[2px]")}
                  style={{ height: `${cancelH}%` }}
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

type SortKey = "task" | "triggered" | "ended" | "duration" | "agent" | "result" | "usage";
type SortDir = "asc" | "desc";
type ResultValue = "success" | "failed" | "running" | "review" | "feedback";

/** The four status buckets shown as the dot next to the operation name — the
 *  app's semantic groups (backlog / in-progress / needs-you / done), NOT the six
 *  raw board columns. `awaiting_review` and `needs_feedback` both collapse into
 *  the single "Needs you" bucket. */
type StatusBucket = "backlog" | "running" | "needsYou" | "done";

const STATUS_DOT: Record<StatusBucket, { dot: string; labelKey: string }> = {
  backlog: { dot: "bg-task-status-backlog", labelKey: "status.backlog" },
  running: { dot: "bg-task-status-running", labelKey: "status.running" },
  needsYou: { dot: "bg-task-status-needs-you", labelKey: "status.needsYou" },
  done: { dot: "bg-task-status-done", labelKey: "status.done" },
};

/** Bucket a *single run* maps to. Derived from the run (each row is one
 *  attempt), NOT the card's current status: a card re-running a new attempt is
 *  running, but an earlier row that ended awaiting a human must still read as
 *  "Needs you". */
function runBucket(run: PastRun): StatusBucket {
  if (run.live) return "running";
  // A cancelled run lands its card in Done, so it belongs in the Done bucket.
  if (run.canceled) return "done";
  switch (run.status) {
    case "completed":
      return "done";
    case "awaiting_review":
    case "needs_feedback":
      return "needsYou";
    case "failed":
      // A failed run bounces its card back to Todo (the backlog).
      return "backlog";
    default:
      return "running";
  }
}

/** A run only has a final verdict once it has completed or failed. Live and
 *  awaiting-human (review / feedback) runs are unfinished → "—" in Result. */
function hasFinalResult(run: PastRun): boolean {
  return !run.live && (run.status === "completed" || run.status === "failed");
}

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
  // Both human-attention buckets surface under one label ("Needs you") to match
  // the Operations page; they keep distinct buckets only for color/filter intent.
  review: { className: "text-task-status-needs-you", labelKey: "result.needsYou" },
  feedback: { className: "text-task-status-needs-you", labelKey: "result.needsYou" },
};

function compareRuns(key: SortKey, a: PastRun, b: PastRun): number {
  switch (key) {
    case "task":
      return a.cardTitle.localeCompare(b.cardTitle);
    case "triggered":
      return a.startedAt.localeCompare(b.startedAt);
    case "ended":
      // Unfinished runs have no end — sort them before finished ones.
      return (a.endedAt ?? "").localeCompare(b.endedAt ?? "");
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
