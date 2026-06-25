"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  EyeIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { HeaderActions } from "@/app/(main)/_components/header-actions";
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
import { useKanban } from "@/hooks/use-kanban";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import type { KanbanCard, KanbanStatus } from "@/types/kanban";
import type { AgentPreset } from "@/types/settings";

/**
 * Temporary "Runs" view from the new UI refactor (Figma `current-runs`).
 * A live overview of running tasks: four status-summary cards + the run table
 * (Task name · Triggered · Status · Duration · Agent), wired to the real kanban
 * data via {@link useKanban}. Each column header reveals a sort + filter menu on
 * hover.
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

const bucketOf = (card: KanbanCard): RunBucket => BUCKET_OF[card.status] ?? "backlog";

export default function RunsPage() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { cards, loading, error } = useKanban();
  const { settings } = useSettings();

  // Clicking a summary card filters the table to that bucket; clicking it again clears.
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

  const agentNameOf = (card: KanbanCard) =>
    settings.agents.find((a) => a.id === (card.agentPresetId ?? settings.defaultAgentId))?.name ?? "";

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

  // The displayed rows: summary-card bucket → column value filters → search → sort.
  const rows = useMemo(() => {
    const agentName = (c: KanbanCard) =>
      settings.agents.find((a) => a.id === (c.agentPresetId ?? settings.defaultAgentId))?.name ?? "";

    let r = listed;
    if (activeBucket) r = r.filter((c) => bucketOf(c) === activeBucket);
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
  }, [
    listed,
    activeBucket,
    statusFilter,
    agentFilter,
    tagFilter,
    query,
    sort,
    t,
    settings.agents,
    settings.defaultAgentId,
  ]);

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

  // True when a card/column/tag/search filter is narrowing the list (sort excluded —
  // it never empties results). Drives the "Clear filters" affordance.
  const narrowed =
    activeBucket !== null ||
    statusFilter.length > 0 ||
    agentFilter.length > 0 ||
    tagFilter.length > 0 ||
    query.trim().length > 0;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-tertiary text-sm">{t("loading")}</p>
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

  return (
    // Figma "App" content width — 968px, centered in the window (1440 artboard).
    // Section gaps are tight + per-Figma (24/8/4/8/10px), not a uniform gap.
    <div className="mx-auto flex w-full max-w-[968px] flex-col">
      {/* List / Kanban view tabs live in the top bar (Figma) via the header slot. */}
      <HeaderActions>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-primary">{t("view.list")}</span>
          {/* Vertical divider between the tabs (Figma). */}
          <span aria-hidden className="h-4 w-px bg-text-tertiary/40" />
          <button
            type="button"
            onClick={() => router.push("/kanban")}
            className="text-text-tertiary transition-colors hover:text-text-secondary"
          >
            {t("view.kanban")}
          </button>
        </div>
      </HeaderActions>

      {/* Title block (Figma: 6px left inset, no inner gap) */}
      <div className="flex flex-col pl-1.5">
        <h1 className="text-text-primary text-base font-medium">{t("title")}</h1>
        <p className="text-text-secondary text-xs font-light">{t("subtitle")}</p>
      </div>

      {/* Filter row: tag chips + search affordance (24px below the title) */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-0.5">
          <span className="pr-2 text-text-tertiary text-xs">{t("tags")}</span>
          {availableTags.map((tag) => {
            const active = tagFilter.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                aria-pressed={active}
                onClick={() => toggleTagFilter(tag)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  active
                    ? "border-text-tertiary/50 bg-secondary text-text-primary"
                    : "border-border-cards bg-secondary text-text-secondary hover:text-text-primary",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-icon-primary">
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
                  <span className="text-text-secondary text-xs font-medium">{t(`summary.${b.key}.label`)}</span>
                </div>
                <span className="text-text-tertiary text-[10px]">{t(`summary.${b.key}.sub`)}</span>
              </div>
              <span className="text-text-primary text-base tabular-nums">{counts[b.key]}</span>
            </button>
          );
        })}
      </div>

      {/* "Needs you" explainer note (4px below the cards) */}
      <p className="mt-1 text-text-tertiary text-xs leading-relaxed">{t("needsYouHint")}</p>

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
          <span className="text-text-tertiary font-light">
            {t("showing", { shown: rows.length, total: totalRuns })}
          </span>
        </div>
        <div className="overflow-hidden rounded-card border border-border-cards bg-card-background">
          <Table>
            <TableHeader>
              <TableRow className="border-border-cards hover:bg-transparent">
                <ColHead label={t("columns.task")} sortKey="task" sort={sort} setSort={setSort} />
                <ColHead
                  label={t("columns.triggered")}
                  sortKey="triggered"
                  sort={sort}
                  setSort={setSort}
                  className="w-[170px]"
                />
                <ColHead
                  label={t("columns.status")}
                  sortKey="status"
                  sort={sort}
                  setSort={setSort}
                  className="w-[140px]"
                  filter={{
                    options: BUCKETS.map((b) => ({ value: b.key, label: t(`summary.${b.key}.label`), dot: b.dot })),
                    selected: statusFilter,
                    onToggle: (v) => toggleStatusFilter(v as RunBucket),
                    onClear: () => setStatusFilter([]),
                  }}
                />
                <ColHead
                  label={t("columns.duration")}
                  sortKey="duration"
                  sort={sort}
                  setSort={setSort}
                  className="w-[100px]"
                />
                <ColHead
                  label={t("columns.agent")}
                  sortKey="agent"
                  sort={sort}
                  setSort={setSort}
                  className="w-[130px]"
                  filter={{
                    options: agentOptions.map((n) => ({ value: n, label: n })),
                    selected: agentFilter,
                    onToggle: toggleAgentFilter,
                    onClear: () => setAgentFilter([]),
                  }}
                />
                <TableHead className="h-10 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="border-border-cards hover:bg-transparent">
                  <TableCell colSpan={6} className="h-24 text-center text-sm">
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
                      <TableCell className="max-w-[280px] truncate text-text-primary text-sm">{card.title}</TableCell>
                      <TableCell className="whitespace-nowrap text-text-secondary text-xs">
                        {formatTriggered(triggeredAt(card))}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 text-text-primary text-xs">
                          <span className={cn("size-2 rounded-full", DOT_OF[bucket])} />
                          {t(`summary.${bucket}.label`)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-text-secondary text-xs tabular-nums">
                        {durationOf(card)}
                      </TableCell>
                      <TableCell>
                        <AgentChip
                          agent={settings.agents.find((a) => a.id === (card.agentPresetId ?? settings.defaultAgentId))}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          onView={() => router.push(`/logs?card=${encodeURIComponent(card.id)}`)}
                          onEdit={() => router.push("/kanban")}
                          labels={{ view: t("rowMenu.view"), edit: t("rowMenu.edit") }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {rows.length > 0 && rows.length < totalRuns && (
            <button
              type="button"
              onClick={clearAll}
              className="w-full border-border-cards border-t border-dashed py-3 text-center text-text-tertiary text-xs transition-colors hover:text-text-secondary"
            >
              {t("footer", { shown: rows.length, total: totalRuns })}
            </button>
          )}
        </div>
      </div>
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
    <TableHead className={cn("group/col h-10 text-text-tertiary text-xs font-normal", className)}>
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
  labels,
}: {
  onView: () => void;
  onEdit: () => void;
  labels: { view: string; edit: string };
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
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}>
          <EyeIcon className="size-3.5" />
          {labels.view}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon className="size-3.5" />
          {labels.edit}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** True when any column/card filter (not search) narrows the list. */
function isFiltering(bucket: RunBucket | null, status: RunBucket[], agent: string[]): boolean {
  return bucket !== null || status.length > 0 || agent.length > 0;
}

/** Comparator for a sortable column (ascending). */
function compareBy(key: SortKey, a: KanbanCard, b: KanbanCard, agentName: (c: KanbanCard) => string): number {
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
  if (b.includes("claude")) return SparklesIcon;
  if (b.includes("copilot") || b.includes("opencode") || b.includes("codex")) return BotIcon;
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
