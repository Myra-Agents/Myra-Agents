"use client";

import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ActivityIcon,
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleStopIcon,
  EyeIcon,
  ListFilterIcon,
  LogInIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Settings2Icon,
  TerminalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { HeaderActions } from "@/app/(main)/_components/header-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MyraMark } from "@/components/ui/myra-mark";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useKanban } from "@/hooks/use-kanban";
import { type RunsColumnId, TOGGLEABLE_COLUMNS, useRunsColumns } from "@/hooks/use-runs-columns";
import { useSettings } from "@/hooks/use-settings";
import { connIdOf } from "@/lib/aggregate/global-id";
import { tagClassName } from "@/lib/kanban-tags";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { cn } from "@/lib/utils";
import type { KanbanCard, KanbanStatus } from "@/types/kanban";
import { isTransitionAllowed } from "@/types/kanban";
import type { AgentPreset } from "@/types/settings";

/**
 * "Runs" view from the new UI refactor (Figma `current-runs` + `current-runs-kanban`).
 * A live overview of running tasks with two layouts, toggled from the top-bar
 * List/Kanban tabs:
 *  - **List** — four status-summary cards + the run table (Task name · Triggered ·
 *    Status · Duration · Agent); each column header reveals a sort + filter menu.
 *  - **Kanban** — the four buckets as side-by-side columns of run cards, each card
 *    surfacing bucket-specific detail (Running output line, "Needs you" question +
 *    Answer affordance, tags). Same data + filters as the list, wired via
 *    {@link useKanban}.
 *
 * Built from the Figma "Theme" semantic tokens added in this refactor
 * (text/icon tiers, card surfaces, task-status accents).
 */

/** Buckets the Figma summary row + status column group statuses into. */
type RunBucket = "backlog" | "running" | "needsYou" | "done";

const BUCKET_OF: Partial<Record<KanbanStatus, RunBucket>> = {
  todo: "backlog",
  in_progress: "running",
  waiting_feedback: "needsYou",
  awaiting_review: "needsYou",
  done: "done",
};

/** Order + accent dot for each bucket, matching the Figma `Columns` row. */
const BUCKETS: { key: RunBucket; dot: string }[] = [
  { key: "backlog", dot: "bg-task-status-backlog" },
  { key: "running", dot: "bg-task-status-running" },
  { key: "needsYou", dot: "bg-task-status-needs-you" },
  { key: "done", dot: "bg-task-status-done" },
];

const DOT_OF: Record<RunBucket, string> = Object.fromEntries(BUCKETS.map((b) => [b.key, b.dot])) as Record<
  RunBucket,
  string
>;
const BUCKET_ORDER: Record<RunBucket, number> = Object.fromEntries(BUCKETS.map((b, i) => [b.key, i])) as Record<
  RunBucket,
  number
>;

/** Cards that belong on the Runs board (drafts + trashed are excluded). */
const LISTED: KanbanStatus[] = ["todo", "in_progress", "waiting_feedback", "awaiting_review", "done"];

/** Sortable columns. */
type SortKey = "task" | "triggered" | "status" | "duration" | "agent";
type SortDir = "asc" | "desc";

/** Top-bar layout toggle. */
type RunsView = "list" | "kanban";

/** Persists the List/Kanban choice across reloads. */
const RUNS_VIEW_KEY = "myra-agents-runs-view";

const bucketOf = (card: KanbanCard): RunBucket => BUCKET_OF[card.status] ?? "backlog";

/**
 * Target status when a card is dropped into a bucket column (Runs board DnD).
 * `needsYou` aggregates two statuses — keep the card's own when it's already
 * there, otherwise default to `awaiting_review` (the only `needsYou` status
 * reachable via drag; `waiting_feedback` is set by the agent asking a question).
 */
const STATUS_FOR_BUCKET: Record<RunBucket, KanbanStatus> = {
  backlog: "todo",
  running: "in_progress",
  needsYou: "awaiting_review",
  done: "done",
};
const dropStatus = (bucket: RunBucket, card: KanbanCard): KanbanStatus =>
  bucket === "needsYou" && (card.status === "waiting_feedback" || card.status === "awaiting_review")
    ? card.status
    : STATUS_FOR_BUCKET[bucket];

/**
 * Whether `card` may be dropped into `bucket` by drag. Reorder within the same
 * bucket is always allowed; **"Needs you" is agent-driven** so cards (e.g. Done)
 * can't be moved into it manually; every other move follows the shared lifecycle
 * rules. Shared by the drop handler and the column's hover hint so they agree.
 */
function canMoveToBucket(card: KanbanCard, bucket: RunBucket): boolean {
  if (bucket === bucketOf(card)) return true;
  if (bucket === "needsYou") return false;
  return isTransitionAllowed(card.status, dropStatus(bucket, card));
}

const noop = () => undefined;

/** Position for a card reordered before `targetId` within its (sorted) status column. */
function insertPosition(column: KanbanCard[], movingId: string, targetId: string): number {
  const sorted = column.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const withoutMoving = sorted.filter((c) => c.id !== movingId);
  const idx = withoutMoving.findIndex((c) => c.id === targetId);
  if (idx === -1) return (sorted[sorted.length - 1]?.position ?? 0) + 1000;
  const movingIdx = sorted.findIndex((c) => c.id === movingId);
  const targetIdx = sorted.findIndex((c) => c.id === targetId);
  const before = movingIdx !== -1 && movingIdx < targetIdx;
  const prev = before ? withoutMoving[idx] : withoutMoving[idx - 1];
  const next = before ? withoutMoving[idx + 1] : withoutMoving[idx];
  const prevPos = prev?.position ?? 0;
  const nextPos = next?.position ?? prevPos + 2000;
  return (prevPos + nextPos) / 2;
}

export default function RunsPage() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { cards, loading, error, trashCard, restoreCard, moveCard, reorderCard, cancelAgent } = useKanban();
  const { settings } = useSettings();
  const { hidden, toggleColumn, resetColumns } = useRunsColumns();

  // List (table) ↔ Kanban (board) layout — toggled from the top-bar tabs and
  // remembered across reloads. Default to "list", then restore the saved choice
  // after mount (localStorage is client-only — reading it in the initializer
  // would mismatch the static-export prerender).
  const [view, setView] = useState<RunsView>("list");
  useEffect(() => {
    const saved = getLocalStorageValue(RUNS_VIEW_KEY);
    if (saved === "list" || saved === "kanban") setView(saved);
  }, []);
  const selectView = useCallback((next: RunsView) => {
    setView(next);
    setLocalStorageValue(RUNS_VIEW_KEY, next);
  }, []);

  // Clicking a summary card filters the table to that bucket; clicking it again clears.
  // (List-only — the Kanban board renders every bucket as its own column.)
  const [activeBucket, setActiveBucket] = useState<RunBucket | null>(null);
  const toggleBucket = (bucket: RunBucket) => setActiveBucket((prev) => (prev === bucket ? null : bucket));

  // Search box (toggled by the magnifier) — matches Task name / Agent / Status.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Per-column sort + value filters (driven by the header hover menus).
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunBucket[]>([]);
  const [agentFilter, setAgentFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const listed = useMemo(
    () => cards.filter((c) => LISTED.includes(c.status)).sort((a, b) => triggeredAt(b).localeCompare(triggeredAt(a))),
    [cards],
  );

  const counts = useMemo(() => {
    const acc: Record<RunBucket, number> = { backlog: 0, running: 0, needsYou: 0, done: 0 };
    for (const c of cards) {
      const bucket = BUCKET_OF[c.status];
      if (bucket) acc[bucket] += 1;
    }
    return acc;
  }, [cards]);

  const totalRuns = useMemo(() => cards.filter((c) => c.status !== "trashed" && c.status !== "draft").length, [cards]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const c of listed) for (const tag of c.tags) tags.add(tag);
    return [...tags]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8);
  }, [listed]);

  // Distinct agent names present in the list — feed the Agent column filter.
  const agentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of listed) {
      const n = settings.agents.find((a) => a.id === (c.agentPresetId ?? settings.defaultAgentId))?.name;
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [listed, settings.agents, settings.defaultAgentId]);

  // Filtered list with everything *except* the summary-card bucket applied
  // (column value filters → search → sort). Shared by the table and the board.
  const filteredBase = useMemo(() => {
    const agentName = (c: KanbanCard) =>
      settings.agents.find((a) => a.id === (c.agentPresetId ?? settings.defaultAgentId))?.name ?? "";

    let r = listed;
    if (statusFilter.length) r = r.filter((c) => statusFilter.includes(bucketOf(c)));
    if (agentFilter.length) r = r.filter((c) => agentFilter.includes(agentName(c)));
    if (tagFilter.length) r = r.filter((c) => c.tags.some((tg) => tagFilter.includes(tg)));

    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          agentName(c).toLowerCase().includes(q) ||
          t(`summary.${bucketOf(c)}.label`)
            .toLowerCase()
            .includes(q),
      );
    }

    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      r = [...r].sort((a, b) => dir * compareBy(sort.key, a, b, agentName));
    }
    return r;
  }, [listed, statusFilter, agentFilter, tagFilter, query, sort, t, settings.agents, settings.defaultAgentId]);

  // Table rows additionally honor the summary-card bucket (List view only).
  const rows = useMemo(
    () => (activeBucket ? filteredBase.filter((c) => bucketOf(c) === activeBucket) : filteredBase),
    [filteredBase, activeBucket],
  );

  // Board groups the filtered list into its four bucket columns (Kanban view).
  const boardColumns = useMemo(() => {
    const groups: Record<RunBucket, KanbanCard[]> = { backlog: [], running: [], needsYou: [], done: [] };
    for (const c of filteredBase) groups[bucketOf(c)].push(c);
    return groups;
  }, [filteredBase]);

  // What the "Showing N of M" line counts in each view.
  const shownCount = view === "kanban" ? filteredBase.length : rows.length;

  const toggleStatusFilter = (b: RunBucket) =>
    setStatusFilter((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  const toggleAgentFilter = (name: string) =>
    setAgentFilter((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  const toggleTagFilter = (tag: string) =>
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));

  const clearAll = () => {
    setActiveBucket(null);
    setQuery("");
    setSearchOpen(false);
    setStatusFilter([]);
    setAgentFilter([]);
    setTagFilter([]);
    setSort(null);
  };

  const openLogs = (id: string) => router.push(`/logs?card=${encodeURIComponent(id)}`);
  // "Edit Patrol" → the owning schedule's settings (the patrol editor). Falls
  // back to the Patrols list when the run isn't linked to a schedule.
  const editPatrol = (card: KanbanCard) =>
    router.push(card.linkedTaskId ? `/schedules/edit/?id=${encodeURIComponent(card.linkedTaskId)}` : "/schedules");
  const trashRun = (id: string) => {
    const bucket = bucketOf(cards.find((c) => c.id === id) ?? ({ status: "todo" } as KanbanCard));
    void trashCard(id).then(() =>
      toast.success(t(bucket === "done" ? "kanban.archived" : "kanban.trashed"), {
        action: { label: t("kanban.undo"), onClick: () => void restoreCard(id) },
      }),
    );
  };
  // Stop a live run from the row/card menu. The backend aborts the child and
  // moves the card out of `in_progress`; the emitted event refreshes the list.
  const stopRun = (id: string) =>
    void cancelAgent(id)
      .then(() => toast.success(t("kanban.stopped")))
      .catch((e) => toast.error(String(e)));

  // "Stop all" — every genuinely running card, gated behind a confirm dialog.
  const runningCards = useMemo(() => listed.filter((c) => bucketOf(c) === "running"), [listed]);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);
  const stopAllRuns = async () => {
    setStoppingAll(true);
    try {
      const results = await Promise.allSettled(runningCards.map((c) => cancelAgent(c.id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) toast.error(t("stopAll.failed", { failed }));
      else toast.success(t("stopAll.stopped", { count: results.length }));
    } finally {
      setStoppingAll(false);
    }
  };

  // True when a card/column/tag/search filter is narrowing the list (sort excluded —
  // it never empties results). Drives the "Clear filters" affordance.
  const narrowed =
    activeBucket !== null ||
    statusFilter.length > 0 ||
    agentFilter.length > 0 ||
    tagFilter.length > 0 ||
    query.trim().length > 0;

  // ── List-table sticky header + internal scroll (mirrors History) ────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cap the list to the space left below it inside its scroll container, so the
  // summary cards + notes above AND the layout's content padding are accounted
  // for: the list fills to the bottom without pushing the page past the fold.
  const [listMaxH, setListMaxH] = useState<number>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when the list mounts (loading→false) or its rows/view change — reshapes the space it must fill.
  useEffect(() => {
    if (view !== "list") return;
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
      const visibleBottom = parentRect.top + scrollParent.clientHeight;
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
  }, [view, loading, rows.length]);

  // Scroll affordance: fade the top/bottom edges + a bounced chevron whenever
  // rows lie above/below the visible viewport.
  const [moreBelow, setMoreBelow] = useState(false);
  const [moreAbove, setMoreAbove] = useState(false);
  const updateMoreBelow = () => {
    const el = scrollRef.current;
    if (!el) return;
    const EPS = 8;
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - EPS);
    setMoreAbove(el.scrollTop > EPS);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure after layout settles.
  useEffect(updateMoreBelow, [listMaxH, rows.length, view]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-tertiary">{t("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  // Column descriptors — one source of truth for the split header/body tables and
  // the colgroup. "task" is the row anchor and is never hidden; the rest toggle
  // via the columns menu and persist through useRunsColumns.
  const columns: ColumnDef[] = [
    {
      id: "task",
      weight: 280,
      cellClassName: "max-w-[280px] truncate text-sm text-text-primary",
      cell: (card) => card.title,
    },
    {
      id: "triggered",
      weight: 180,
      cellClassName: "whitespace-nowrap text-text-secondary text-xs",
      cell: (card) => formatTriggered(triggeredAt(card)),
    },
    {
      id: "status",
      weight: 140,
      cell: (card) => (
        <span className="flex items-center gap-2 text-text-primary text-xs">
          <span className={cn("size-2 rounded-full", DOT_OF[bucketOf(card)])} />
          {t(`summary.${bucketOf(card)}.label`)}
        </span>
      ),
      filter: {
        options: BUCKETS.map((b) => ({ value: b.key, label: t(`summary.${b.key}.label`), dot: b.dot })),
        selected: statusFilter,
        onToggle: (v) => toggleStatusFilter(v as RunBucket),
        onClear: () => setStatusFilter([]),
      },
    },
    {
      id: "duration",
      weight: 100,
      cellClassName: "whitespace-nowrap text-text-secondary text-xs tabular-nums",
      cell: (card) => durationOf(card),
    },
    {
      id: "agent",
      weight: 150,
      cell: (card) => (
        <AgentChip agent={settings.agents.find((a) => a.id === (card.agentPresetId ?? settings.defaultAgentId))} />
      ),
      filter: {
        options: agentOptions.map((n) => ({ value: n, label: n })),
        selected: agentFilter,
        onToggle: toggleAgentFilter,
        onClear: () => setAgentFilter([]),
      },
    },
  ];
  const visibleColumns = columns.filter((c) => c.id === "task" || !hidden.includes(c.id as RunsColumnId));

  return (
    // Figma "App" content width — 968px, shared by the table and the board so the
    // title, filter row and content all align. Centered in the window. The Kanban
    // view fills the viewport height (columns scroll internally, page doesn't).
    <div className={cn("mx-auto flex w-full max-w-[968px] flex-col", view === "kanban" && "h-full min-h-0")}>
      {/* List / Kanban view tabs live in the top bar (Figma) via the header slot. */}
      <HeaderActions>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => selectView("list")}
            aria-pressed={view === "list"}
            className={cn(
              "transition-colors",
              view === "list" ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {t("view.list")}
          </button>
          {/* Vertical divider between the tabs (Figma). */}
          <span aria-hidden className="h-4 w-px bg-text-tertiary/40" />
          <button
            type="button"
            onClick={() => selectView("kanban")}
            aria-pressed={view === "kanban"}
            className={cn(
              "transition-colors",
              view === "kanban" ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {t("view.kanban")}
          </button>
        </div>
      </HeaderActions>

      {/* Title block (Figma: 6px left inset, no inner gap) */}
      <div className="flex flex-col pl-1.5">
        <h1 className="font-medium text-base text-text-primary">{t("title")}</h1>
        <p className="font-light text-text-secondary text-xs">{t("subtitle")}</p>
      </div>

      {/* Filter row: tag chips + search affordance (24px below the title) */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-0.5">
          <span className="pr-2 text-text-tertiary text-xs">{t("tags")}</span>
          {availableTags.length === 0 && <span className="shrink-0 text-text-tertiary/70 text-xs">{t("noTags")}</span>}
          {availableTags.map((tag) => {
            const active = tagFilter.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                aria-pressed={active}
                onClick={() => toggleTagFilter(tag)}
                className={cn(
                  // Same per-tag palette as Patrols' filter chips.
                  "rounded-full border px-2 py-0.5 text-xs transition-all",
                  tagClassName(tag),
                  active ? "opacity-100 ring-1 ring-current/40" : "opacity-60 hover:opacity-100",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-icon-primary">
          {/* Stop all — only while at least one run is live; confirmed via dialog. */}
          {runningCards.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmStopAll(true)}
              disabled={stoppingAll}
              className="flex h-6 items-center gap-1.5 text-text-secondary text-xs transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
            >
              <CircleStopIcon className="size-4" />
              {t(stoppingAll ? "stopAll.stopping" : "stopAll.label")}
            </button>
          )}
          {view === "list" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("columnsLabel")}
                  className={cn(
                    "flex h-6 items-center text-icon-tertiary transition-colors hover:text-icon-primary",
                    hidden.length > 0 && "text-icon-primary",
                  )}
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
          )}
          {searchOpen ? (
            <div className="flex h-6 items-center gap-1.5">
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
                // Collapse back to the icon on click-away when empty; keep open
                // while a query is active so the running filter stays visible.
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
                aria-label={t("rowMenu.clearSearch")}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-6 items-center transition-colors hover:text-icon-primary"
              aria-label={t("search")}
            >
              <SearchIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {view === "list" ? (
        <>
          {/* Status summary cards — click to filter the table to that bucket. */}
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {BUCKETS.map((b) => {
              const active = activeBucket === b.key;
              return (
                <button
                  type="button"
                  key={b.key}
                  aria-pressed={active}
                  onClick={() => toggleBucket(b.key)}
                  className={cn(
                    "flex items-center justify-between rounded-card border bg-card-background px-4 py-4 text-left transition-colors",
                    active
                      ? "border-text-tertiary/50 bg-secondary/40"
                      : "border-border-cards hover:border-text-tertiary/30 hover:bg-secondary/20",
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className={cn("size-2 rounded-full", b.dot)} />
                      <span className="font-medium text-text-secondary text-xs">{t(`summary.${b.key}.label`)}</span>
                    </div>
                    <span className="text-[10px] text-text-tertiary">{t(`summary.${b.key}.sub`)}</span>
                  </div>
                  <span className="text-base text-text-primary tabular-nums">{counts[b.key]}</span>
                </button>
              );
            })}
          </div>

          {/* "Needs you" explainer note (4px below the cards) */}
          <p className="mt-1 text-text-tertiary text-xs leading-relaxed">{t("needsYouHint")}</p>
          {/* Nightly auto-archive notice — mirrors the server scheduler. */}
          <p className="mt-1 text-text-tertiary text-xs leading-relaxed">
            {t("archiveHint", { timezone: settings.timezone ?? "Europe/Paris" })}
          </p>

          {/* Run table (8px below the note; 10px between the count line and table) */}
          <div className="mt-2 flex flex-col gap-2.5">
            <div className="flex items-center justify-end gap-2 text-xs">
              {rows.length === 0 && narrowed && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline"
                >
                  {t("clearFilters")}
                </button>
              )}
              <span className="font-light text-text-tertiary">
                {t("showing", { shown: rows.length, total: totalRuns })}
              </span>
            </div>
            {/* Run table — the column header stays pinned while rows scroll under
                it (mirrors History). The header lives OUTSIDE the scroller so it
                never moves; header + body are two width-synced `table-fixed`
                tables sharing <Cols/> for column alignment. */}
            <div className="relative overflow-hidden rounded-card border border-border-cards bg-card-background">
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
                style={{ maxHeight: listMaxH }}
              >
                <table className="w-full table-fixed">
                  <Cols columns={visibleColumns} />
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow className="border-border-cards hover:bg-transparent">
                        <TableCell colSpan={visibleColumns.length + 1} className="h-24 text-center text-sm">
                          <div className="flex flex-col items-center gap-2">
                            <span className="text-text-tertiary">
                              {query
                                ? t("noResults")
                                : isFiltering(activeBucket, statusFilter, agentFilter)
                                  ? t("emptyFiltered")
                                  : t("empty")}
                            </span>
                            {narrowed && (
                              <button
                                type="button"
                                onClick={clearAll}
                                className="text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline"
                              >
                                {t("clearFilters")}
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((card) => {
                        const bucket = bucketOf(card);
                        return (
                          <TableRow
                            key={card.id}
                            className="cursor-pointer border-border-cards hover:bg-secondary/40"
                            onClick={() => router.push(`/logs?card=${encodeURIComponent(card.id)}`)}
                          >
                            {visibleColumns.map((c) => (
                              <TableCell key={c.id} className={c.cellClassName}>
                                {c.cell(card)}
                              </TableCell>
                            ))}
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <RowMenu
                                onView={() => openLogs(card.id)}
                                onEdit={bucket !== "done" ? () => editPatrol(card) : undefined}
                                editDisabled={!card.linkedTaskId}
                                // Stop only for genuinely running rows.
                                onStop={bucket === "running" ? () => stopRun(card.id) : undefined}
                                onTrash={() => trashRun(card.id)}
                                archive={bucket === "done"}
                                labels={{
                                  view: t("rowMenu.viewOperation"),
                                  edit: t("rowMenu.editPatrol"),
                                  stop: t("rowMenu.stop"),
                                  trash: t(bucket === "done" ? "kanban.archive" : "kanban.trash"),
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </table>
              </div>
              {/* "More above" affordance — absolute overlay on the card (kept out of
                  the scroller so it can't inflate scrollHeight). Sits below the fixed
                  header (h-10). Hidden until scrolled down. */}
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
              {/* "More below" affordance — fades the lower edge + a nudging chevron.
                  Hidden once scrolled to the bottom. */}
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
            {rows.length > 0 && rows.length < totalRuns && (
              <button
                type="button"
                onClick={clearAll}
                className="text-center text-text-tertiary text-xs transition-colors hover:text-text-secondary"
              >
                {t("footer", { shown: rows.length, total: totalRuns })}
              </button>
            )}
          </div>
        </>
      ) : (
        <RunsKanbanBoard
          columns={boardColumns}
          allCards={filteredBase}
          shown={shownCount}
          total={totalRuns}
          narrowed={narrowed}
          onClear={clearAll}
          onOpenLogs={openLogs}
          onTrash={trashRun}
          onEdit={editPatrol}
          onStop={stopRun}
          onMove={moveCard}
          onReorder={reorderCard}
        />
      )}

      {/* Stop-all guard — aborting every live run is not undoable. */}
      <AlertDialog open={confirmStopAll} onOpenChange={setConfirmStopAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stopAll.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("stopAll.description", { count: runningCards.length })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("stopAll.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmStopAll(false);
                void stopAllRuns();
              }}
            >
              {t("stopAll.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A column header with a hover-revealed sort + (optional) value-filter menu. */
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
  const t = useTranslations("runs");
  const sorted = sort?.key === sortKey;
  const hasFilter = (filter?.selected.length ?? 0) > 0;
  const active = sorted || hasFilter;
  // Selecting the active direction again clears the sort.
  const applySort = (dir: SortDir) => setSort(sorted && sort?.dir === dir ? null : { key: sortKey, dir });

  return (
    <TableHead className={cn("group/col h-10 font-normal text-text-tertiary text-xs", className)}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {/* Active sort arrow — click flips asc/desc directly. */}
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
                  "rounded p-0.5 text-icon-tertiary opacity-0 transition hover:text-icon-primary group-hover/col:opacity-100 data-[state=open]:opacity-100",
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

/** Filter affordance attached to a column header (Status + Agent use it). */
type ColFilter = {
  options: { value: string; label: string; dot?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
};

/** A single Operations table column. `weight` is a relative share of the table
 *  width — larger is wider. `cellClassName` styles the body cell. */
type ColumnDef = {
  id: SortKey;
  weight: number;
  cellClassName?: string;
  cell: (card: KanbanCard) => React.ReactNode;
  filter?: ColFilter;
};

/** Weight of the trailing row-actions column (the `⋯` menu) — a thin gutter. */
const ACTIONS_COL_WEIGHT = 45;

/** Shared column widths for the split header + body tables, so their columns line
 *  up. Each visible column takes a share of the table width proportional to its
 *  `weight` (as a percentage so `table-fixed` honors it). Hiding a column makes
 *  the rest grow to fill the gap, keeping their relative proportions. */
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

/** A bordered chip with the agent's icon + name, mirroring the Figma Agent cell. */
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

function RowMenu({
  onView,
  onEdit,
  onStop,
  onTrash,
  archive = false,
  editDisabled = false,
  labels,
}: {
  onView: () => void;
  onEdit?: () => void;
  // Present only for running rows — stops the live run.
  onStop?: () => void;
  // Trash (or archive, for Done rows) the run — mirrors the Kanban card's
  // hover affordance so the List view offers the same action.
  onTrash: () => void;
  archive?: boolean;
  // "Edit Patrol" needs an owning schedule — grey it out when the run isn't
  // linked to one (mirrors the History row menu).
  editDisabled?: boolean;
  labels: { view: string; edit: string; stop: string; trash: string };
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-icon-tertiary transition-colors hover:bg-secondary hover:text-icon-primary"
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onView} className="whitespace-nowrap">
          <EyeIcon className="size-3.5" />
          {labels.view}
        </DropdownMenuItem>
        {onStop && (
          <DropdownMenuItem onClick={onStop} className="whitespace-nowrap">
            <CircleStopIcon className="size-3.5" />
            {labels.stop}
          </DropdownMenuItem>
        )}
        {onEdit && (
          <DropdownMenuItem onClick={onEdit} disabled={editDisabled} className="whitespace-nowrap">
            <PencilIcon className="size-3.5" />
            {labels.edit}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onTrash} className="whitespace-nowrap">
          {archive ? <ArchiveIcon className="size-3.5" /> : <Trash2Icon className="size-3.5" />}
          {labels.trash}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** True when any column/card filter (not search) narrows the list. */
function isFiltering(bucket: RunBucket | null, status: RunBucket[], agent: string[]): boolean {
  return bucket !== null || status.length > 0 || agent.length > 0;
}

/**
 * The Kanban layout (Figma `current-runs-kanban`): the four buckets as
 * side-by-side columns of run cards. Shares the list's filtered data — only the
 * presentation differs.
 */
function RunsKanbanBoard({
  columns,
  allCards,
  shown,
  total,
  narrowed,
  onClear,
  onOpenLogs,
  onTrash,
  onEdit,
  onStop,
  onMove,
  onReorder,
}: {
  columns: Record<RunBucket, KanbanCard[]>;
  allCards: KanbanCard[];
  shown: number;
  total: number;
  narrowed: boolean;
  onClear: () => void;
  onOpenLogs: (id: string) => void;
  onTrash: (id: string) => void;
  onEdit: (card: KanbanCard) => void;
  onStop: (id: string) => void;
  onMove: (id: string, status: KanbanStatus) => undefined | Promise<unknown>;
  onReorder: (id: string, newPosition: number, status?: KanbanStatus) => void;
}) {
  const t = useTranslations("runs");
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  // Bucket the dragged card is currently over (column or any card within it) —
  // drives the per-column drop hint even when hovering over a card.
  const [overBucket, setOverBucket] = useState<RunBucket | null>(null);
  // Brief red flash on a card whose drop the lifecycle rules reject.
  const [invalidDropId, setInvalidDropId] = useState<string | null>(null);
  // distance:8 → a plain click still opens logs; only a real drag picks the card up.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const cardById = useMemo(() => {
    const m = new Map<string, KanbanCard>();
    for (const c of allCards) m.set(c.id, c);
    return m;
  }, [allCards]);

  const rejectDrop = (id: string) => {
    setInvalidDropId(id);
    setTimeout(() => setInvalidDropId(null), 450);
  };

  const resolveBucket = (overId: string | null): RunBucket | null => {
    if (!overId) return null;
    const col = BUCKETS.find((b) => b.key === overId)?.key;
    if (col) return col;
    const c = cardById.get(overId);
    return c ? bucketOf(c) : null;
  };

  const handleDragStart = (e: DragStartEvent) => setActiveCard(cardById.get(e.active.id as string) ?? null);

  const handleDragOver = (e: DragOverEvent) => setOverBucket(resolveBucket((e.over?.id as string) ?? null));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveCard(null);
    setOverBucket(null);
    if (!over) return;

    const card = cardById.get(active.id as string);
    if (!card) return;

    const overId = over.id as string;
    const overBucket = BUCKETS.find((b) => b.key === overId)?.key ?? null;
    const overCard = overBucket ? null : cardById.get(overId);
    const targetBucket = overBucket ?? (overCard ? bucketOf(overCard) : null);
    if (!targetBucket) return;

    // Same bucket → reorder among cards of the same status (positions are
    // per-status, per-server). Cross-status within a bucket isn't a move.
    if (targetBucket === bucketOf(card)) {
      if (
        overCard &&
        overCard.id !== card.id &&
        overCard.status === card.status &&
        connIdOf(overCard.id) === connIdOf(card.id)
      ) {
        const column = allCards.filter((c) => c.status === card.status && connIdOf(c.id) === connIdOf(card.id));
        onReorder(card.id, insertPosition(column, card.id, overCard.id));
      }
      return;
    }

    // Cross-bucket move — "Needs you" is agent-driven (no manual drops in), the
    // rest follow the shared lifecycle rules. Rejected drops flash red instead.
    if (!canMoveToBucket(card, targetBucket)) return rejectDrop(card.id);
    void onMove(card.id, dropStatus(targetBucket, card));
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2.5">
        {/* Fixed height so toggling the filter badge never shifts the board down. */}
        <div className="flex h-6 shrink-0 items-center justify-end gap-2 text-xs">
          {narrowed && (
            <>
              {/* Active-filter badge: flags that the board is narrowed and how many
                  runs are hidden, with a one-click clear. */}
              <span className="flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-text-secondary">
                <ListFilterIcon className="size-3 shrink-0" />
                {t("filteredHidden", { hidden: total - shown })}
              </span>
              <button
                type="button"
                onClick={onClear}
                className="text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline"
              >
                {t("clearFilters")}
              </button>
            </>
          )}
          <span className="font-light text-text-tertiary">{t("showing", { shown, total })}</span>
        </div>
        {/* Four buckets filling the content width (like the List table); columns are
            fixed to the viewport height and scroll internally, so the page never
            scrolls vertically. Horizontal scroll only when the window is too narrow. */}
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
          <div className="flex h-full gap-2.5">
            {BUCKETS.map((b) => (
              <RunsBucketColumn
                key={b.key}
                bucket={b.key}
                dot={b.dot}
                cards={columns[b.key]}
                activeCard={activeCard}
                isTarget={overBucket === b.key}
                onOpenLogs={onOpenLogs}
                onTrash={onTrash}
                onEdit={onEdit}
                onStop={onStop}
                invalidDropId={invalidDropId}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard && (
          <KanbanRunCard
            card={activeCard}
            bucket={bucketOf(activeCard)}
            onOpen={noop}
            onTrash={noop}
            onEdit={noop}
            isOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** One bucket column: top-rounded header card + a droppable, internally-scrolling task list. */
function RunsBucketColumn({
  bucket,
  dot,
  cards,
  activeCard,
  isTarget,
  onOpenLogs,
  onTrash,
  onEdit,
  onStop,
  invalidDropId,
}: {
  bucket: RunBucket;
  dot: string;
  cards: KanbanCard[];
  activeCard: KanbanCard | null;
  isTarget: boolean;
  onOpenLogs: (id: string) => void;
  onTrash: (id: string) => void;
  onEdit: (card: KanbanCard) => void;
  onStop: (id: string) => void;
  invalidDropId: string | null;
}) {
  const t = useTranslations("runs");
  const { setNodeRef } = useDroppable({ id: bucket, data: { type: "bucket", bucket } });
  // While the dragged card targets this column (even hovering a card inside it),
  // hint whether it can land here (mirrors /kanban).
  const canDrop = activeCard ? canMoveToBucket(activeCard, bucket) : false;
  const showHint = isTarget && activeCard !== null;

  return (
    <div className="flex h-full min-h-0 min-w-[200px] flex-1 flex-col">
      {/* Column header — its own top-rounded card, inset over the list (Figma
          "Total Schedules"): dot + label + sub on the card surface. */}
      <div className="mx-2 flex shrink-0 flex-col gap-0.5 rounded-t-card border-border-cards border-x border-t bg-card-background px-[18px] py-2">
        <div className="flex items-center gap-1">
          <span className={cn("size-2 rounded-full", dot)} />
          <span className="font-medium text-text-secondary text-xs">{t(`summary.${bucket}.label`)}</span>
        </div>
        <span className="text-[10px] text-text-tertiary">{t(`summary.${bucket}.sub`)}</span>
      </div>
      {/* Task list — secondary surface, droppable; fills the column and scrolls
          internally. Outline brightens while a card hovers over it. */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[var(--kanban-radius)] border bg-card-background-secondary p-2.5 transition-colors",
          showHint ? (canDrop ? "border-text-tertiary/50" : "border-destructive/50") : "border-border-cards",
        )}
      >
        {/* Drop hint while a card hovers the column — allowed vs. blocked (e.g. a
            Done card can't enter "Needs you"). */}
        {showHint && (
          <p
            className={cn(
              "shrink-0 rounded-md border border-dashed px-2 py-2 text-center text-[11px]",
              canDrop ? "border-text-tertiary/40 text-text-secondary" : "border-destructive/50 text-destructive",
            )}
          >
            {canDrop ? t("kanban.dropHere") : t("kanban.dropBlocked")}
          </p>
        )}
        {cards.length === 0
          ? !showHint && (
              <p className="px-2 py-6 text-center text-[11px] text-text-tertiary">{t("kanban.emptyColumn")}</p>
            )
          : null}
        {cards.length > 0 && (
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <KanbanRunCard
                key={card.id}
                card={card}
                bucket={bucket}
                onOpen={() => onOpenLogs(card.id)}
                onTrash={() => onTrash(card.id)}
                onEdit={() => onEdit(card)}
                onStop={() => onStop(card.id)}
                isShaking={invalidDropId === card.id}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

/** A single run card on the board — bucket drives the body it surfaces. Draggable
 *  via @dnd-kit; a plain click (no movement) still opens the run's logs. */
function KanbanRunCard({
  card,
  bucket,
  onOpen,
  onTrash,
  onEdit,
  onStop,
  isOverlay = false,
  isShaking = false,
}: {
  card: KanbanCard;
  bucket: RunBucket;
  onOpen: () => void;
  onTrash: () => void;
  onEdit: () => void;
  onStop?: () => void;
  isOverlay?: boolean;
  isShaking?: boolean;
}) {
  const t = useTranslations("runs");
  const stop = (e: ReactMouseEvent) => e.stopPropagation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: isOverlay,
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-kanban-card
      type="button"
      onClick={isOverlay ? undefined : onOpen}
      className={cn(
        "group/card flex cursor-pointer flex-col gap-2.5 rounded-card border border-border-cards bg-card-background p-4 text-left transition-colors hover:border-text-tertiary/30",
        isDragging && !isOverlay && "opacity-30",
        isOverlay && "rotate-1 shadow-lg",
        isShaking && "border-destructive ring-1 ring-destructive",
      )}
    >
      {/* Top: status dot + hover edit/trash affordances. */}
      <div className="flex items-start justify-between">
        <span className={cn("mt-0.5 size-2 shrink-0 rounded-full", DOT_OF[bucket])} />
        <div className="flex items-center gap-1 text-icon-tertiary opacity-0 transition group-hover/card:opacity-100">
          {bucket !== "done" && (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                onEdit();
              }}
              aria-label={t("kanban.edit")}
              className="rounded p-0.5 transition-colors hover:text-icon-primary"
            >
              <PencilIcon className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onTrash();
            }}
            aria-label={bucket === "done" ? t("kanban.archive") : t("kanban.trash")}
            className="rounded p-0.5 transition-colors hover:text-destructive"
          >
            {bucket === "done" ? <ArchiveIcon className="size-3.5" /> : <Trash2Icon className="size-3.5" />}
          </button>
        </div>
      </div>

      <h3 className="text-sm text-text-primary leading-snug">{card.title}</h3>

      {/* Running: live status line + output hint. */}
      {bucket === "running" && (
        <>
          <span aria-hidden className="h-px w-full bg-border-cards" />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-task-status-running text-xs">
                <ActivityIcon className="size-3.5" />
                {t("kanban.running")}
              </span>
              <span className="text-text-tertiary text-xs tabular-nums">{durationOf(card)}</span>
            </div>
            <span className="truncate text-text-tertiary text-xs">{t("kanban.waitingOutput")}</span>
            {onStop && (
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onStop();
                }}
                className="flex items-center justify-center gap-1.5 self-stretch rounded-md border border-border-cards bg-secondary/40 py-1.5 text-text-secondary text-xs transition-colors hover:bg-secondary hover:text-destructive"
              >
                <CircleStopIcon className="size-3.5" />
                {t("kanban.stop")}
              </button>
            )}
          </div>
        </>
      )}

      {/* Needs you: the agent's pending question + an Answer affordance. */}
      {bucket === "needsYou" && (
        <>
          <span aria-hidden className="h-px w-full bg-border-cards" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-task-status-needs-you text-xs">
                <MessageSquareIcon className="size-3.5" />
                {t("kanban.question")}
              </span>
              <span className="text-text-tertiary text-xs tabular-nums">{durationOf(card)}</span>
            </div>
            {card.agentQuestion && <p className="text-text-secondary text-xs leading-relaxed">{card.agentQuestion}</p>}
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                onOpen();
              }}
              className="flex items-center justify-center gap-1.5 self-stretch rounded-md border border-border-cards bg-secondary/40 py-1.5 text-text-secondary text-xs transition-colors hover:bg-secondary hover:text-text-primary"
            >
              {t("kanban.answer")}
              <LogInIcon className="size-3.5" />
            </button>
          </div>
        </>
      )}

      {/* Tags — per-tag palette, matching the Patrols page. The divider above sits
          between the title (or bucket body) and the tag row. */}
      {card.tags.length > 0 && (
        <>
          <span aria-hidden className="h-px w-full bg-border-cards" />
          <div className="flex flex-wrap gap-1">
            {card.tags.map((tag) => (
              <span key={tag} className={tagClassName(tag, "rounded-md border px-2 py-0.5 text-[11px]")}>
                {tag}
              </span>
            ))}
          </div>
        </>
      )}
    </button>
  );
}

/** Comparator for a sortable column (ascending). */
function compareBy(key: SortKey, a: KanbanCard, b: KanbanCard, agentName: (c: KanbanCard) => string): number {
  // biome-ignore lint/nursery/noUnnecessaryConditions: the rule misreads a switch over a string-literal union as an always-truthy boolean condition.
  switch (key) {
    case "task":
      return a.title.localeCompare(b.title);
    case "triggered":
      return triggeredAt(a).localeCompare(triggeredAt(b));
    case "status":
      return BUCKET_ORDER[bucketOf(a)] - BUCKET_ORDER[bucketOf(b)];
    case "duration":
      return durationMs(a) - durationMs(b);
    case "agent":
      return agentName(a).localeCompare(agentName(b));
  }
}

/** Pick a lucide glyph for the agent binary (no brand marks in lucide). */
function agentIcon(binary: string) {
  const b = binary.toLowerCase();
  if (b === "myra-embedded") return MyraMark;
  if (b.includes("opencode")) return BotIcon;
  return TerminalIcon;
}

/** When a run was triggered: prefer the agent start, fall back to creation. */
function triggeredAt(card: KanbanCard): string {
  return card.agentRunStartedAt ?? card.createdAt;
}

function formatTriggered(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Run duration in ms, or -1 when the run hasn't produced timing. */
function durationMs(card: KanbanCard): number {
  const start = card.agentRunStartedAt;
  if (!start) return -1;
  const end = card.agentRunEndedAt ?? (card.status === "in_progress" ? new Date().toISOString() : undefined);
  if (!end) return -1;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isNaN(ms) || ms < 0 ? -1 : ms;
}

/** Elapsed for a running card, total for a finished one, else em-dash. */
function durationOf(card: KanbanCard): string {
  const ms = durationMs(card);
  if (ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} m ${s % 60} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} m`;
}
