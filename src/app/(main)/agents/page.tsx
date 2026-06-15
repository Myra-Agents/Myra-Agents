"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BotIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  ScrollTextIcon,
  SearchIcon,
  SquareIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useKanban } from "@/hooks/use-kanban";
import { useSettings } from "@/hooks/use-settings";
import { parseGlobalId } from "@/lib/aggregate/global-id";
import { invokeOn } from "@/lib/tauri";
import type { AgentRun, KanbanCard } from "@/types/kanban";

/** Re-render cadence for the live "elapsed" counters on running cards. */
const TICK_MS = 30_000;

type Bucket = "backlog" | "running" | "needsYou" | "done";

/** Status dot colors from the design. */
const BUCKET_DOT: Record<Bucket, string> = {
  backlog: "#888780",
  running: "#EF9F27",
  needsYou: "#7F77DD",
  done: "#639922",
};

const BUCKETS: Bucket[] = ["backlog", "running", "needsYou", "done"];
const MAX_ROWS = 8;

type SortKey = "task" | "triggered" | "status" | "duration" | "agent";

function bucketOf(card: KanbanCard): Bucket | null {
  if (card.status === "in_progress" || card.agentQueued) return "running";
  if (card.status === "waiting_feedback" || card.status === "awaiting_review") return "needsYou";
  if (card.status === "done") return "done";
  if (card.status === "draft" || card.status === "todo") return "backlog";
  return null; // trashed
}

export default function AgentsPage() {
  const t = useTranslations("runningAgents");
  const router = useRouter();
  const { settings } = useSettings();
  const { cards, loading } = useKanban(settings.agents);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const [filter, setFilter] = useState<Bucket | "all">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("triggered");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const presetName = useCallback(
    (card: KanbanCard) => {
      const id = card.agentPresetId ?? settings.defaultAgentId;
      return settings.agents.find((a) => a.id === id)?.name;
    },
    [settings.agents, settings.defaultAgentId],
  );

  // Every non-trashed card is an "agent task"; these feed both the tile counts
  // and the table. `total` (below) is this unfiltered set.
  const allRows = useMemo(
    () =>
      cards
        .map((card) => {
          const bucket = bucketOf(card);
          if (!bucket) return null;
          const run = latestRun(card);
          return { card, bucket, run, triggeredAt: card.agentRunStartedAt ?? run?.startedAt };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
    [cards],
  );

  // Per-bucket counts feed the summary tiles.
  const counts = useMemo(() => {
    const acc: Record<Bucket, number> = { backlog: 0, running: 0, needsYou: 0, done: 0 };
    for (const r of allRows) acc[r.bucket]++;
    return acc;
  }, [allRows]);

  // Apply the active tile filter + search, newest run first.
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows
      .filter((r) => filter === "all" || r.bucket === filter)
      .filter((r) => q === "" || r.card.title.toLowerCase().includes(q) || presetName(r.card)?.toLowerCase().includes(q))
      .sort((a, b) => {
        const cmp = compareBy(sortKey, a, b, presetName, now);
        return sortDir === "desc" ? -cmp : cmp;
      });
  }, [allRows, filter, query, presetName, sortKey, sortDir, now]);

  const total = allRows.length;
  const visibleRows = filteredRows.slice(0, MAX_ROWS);
  const shown = visibleRows.length;
  const isFiltering = filter !== "all" || query.trim() !== "";
  // Some agents are hidden (by the active filter/search or the row cap) → the
  // last visible row gets a dashed separator to hint there's more.
  const hasHidden = shown < total;

  const clearFilters = useCallback(() => {
    setFilter("all");
    setQuery("");
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // Wait for the width transition to start, then focus the revealed input.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeSearchIfEmpty = useCallback(() => {
    if (query.trim() === "") setSearchOpen(false);
  }, [query]);

  const toggleTile = useCallback((b: Bucket) => setFilter((cur) => (cur === b ? "all" : b)), []);

  const toggleSort = useCallback(
    (key: SortKey) => {
      // Same column → flip direction; new column → start descending. Setters are
      // kept flat (no nesting) so React's StrictMode double-invoke can't cancel
      // the toggle.
      if (sortKey === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  const handleStop = useCallback(
    async (card: KanbanCard) => {
      const { connId, entityId } = parseGlobalId(card.id);
      try {
        await invokeOn(connId, "cancel_agent", { cardId: entityId });
        toast.success(t("toast.stopped", { name: card.title }));
      } catch (e) {
        toast.error(String(e));
      }
    },
    [t],
  );

  const handleView = useCallback(
    (card: KanbanCard) => router.push(`/logs?card=${encodeURIComponent(card.id)}`),
    [router],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div
      // Dark canvas matching the design. Scoping `dark` + overriding the token
      // values keeps every child component token-driven while pinning the exact
      // palette (bg #141415, cards #171717, strokes #1D1D1E, focus #8A8A8A).
      // The negative margins cancel the layout's content padding for a full-bleed
      // background, then re-add the inset inside.
      className="dark -m-4 min-h-full bg-background p-4 text-foreground md:-m-6 md:p-6"
      style={
        {
          "--background": "#141415",
          "--card": "#171717",
          "--popover": "#171717",
          "--border": "#1D1D1E",
          "--input": "#1D1D1E",
          "--ring": "#8A8A8A",
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-2">
        {/* Title + search */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 pb-2">
            <h1 className="font-medium text-base leading-tight tracking-tight">{t("title")}</h1>
            <p className="font-light text-muted-foreground text-xs">{t("description")}</p>
          </div>

          <div className="flex items-center gap-1">
            {/* Search: just the loupe; clicking it slides a text field open to the left. */}
            <div className="flex items-center">
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={closeSearchIfEmpty}
                aria-hidden={!searchOpen}
                tabIndex={searchOpen ? 0 : -1}
                className={`h-8 overflow-hidden text-sm transition-[width,opacity,padding] duration-200 ease-out ${
                  searchOpen ? "w-48 px-2.5 opacity-100" : "w-0 border-0 px-0 opacity-0"
                }`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label={t("search")}
                onClick={() => (searchOpen ? closeSearchIfEmpty() : openSearch())}
              >
                <SearchIcon className="size-4" />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={t("filter")}>
                  <ListFilterIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuRadioGroup value={filter} onValueChange={(v) => setFilter(v as Bucket | "all")}>
                  <DropdownMenuRadioItem value="all">{t("filterAll")}</DropdownMenuRadioItem>
                  {BUCKETS.map((b) => (
                    <DropdownMenuRadioItem key={b} value={b}>
                      {t(`tiles.${b}.label`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Status tiles — click to filter the list by status */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {BUCKETS.map((b) => (
            <StatTile key={b} bucket={b} count={counts[b]} active={filter === b} onClick={() => toggleTile(b)} />
          ))}
        </div>

        {/* Caption */}
        <p className="px-1 pt-1 text-[#9C9A92] text-xs">{t("caption")}</p>

        {/* Task list */}
        <div className="mt-2 flex flex-col gap-2">
          <span className="self-end font-light text-muted-foreground text-xs">{t("showing", { shown, total })}</span>
          <div className="group/table w-full overflow-hidden rounded-[10px] border bg-card">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead column="task" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-[30%]" />
                  <SortableHead column="triggered" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-[18%]" />
                  <SortableHead column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-[15%]" />
                  <SortableHead column="duration" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-[12%]" />
                  <SortableHead column="agent" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-[19%]" />
                  <TableHead className="h-10 w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground text-sm">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map(({ card, bucket, run, triggeredAt }, i) => (
                    <TableRow
                      key={card.id}
                      className={`h-[30px] cursor-pointer ${
                        hasHidden && i === visibleRows.length - 1
                          ? "!border-b-0 [&>td]:border-border [&>td]:border-b [&>td]:border-dashed"
                          : ""
                      }`}
                      onClick={() => handleView(card)}
                    >
                      <TableCell className="truncate font-light text-xs">{card.title}</TableCell>
                      <TableCell className="whitespace-nowrap font-light text-muted-foreground text-xs">
                        {triggeredAt ? formatTriggered(triggeredAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 text-xs">
                          <span className="size-2 rounded-full" style={{ backgroundColor: BUCKET_DOT[bucket] }} />
                          <span className="font-light">{t(`tiles.${bucket}.label`)}</span>
                        </span>
                      </TableCell>
                      <TableCell className="font-light text-muted-foreground text-xs tabular-nums">
                        {formatDuration(card, run, now)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs">
                          <BotIcon className="size-3.5 text-muted-foreground" />
                          <span className="max-w-24 truncate">{presetName(card) ?? t("noAgent")}</span>
                        </span>
                      </TableCell>
                      <TableCell className="w-10 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          onView={() => handleView(card)}
                          onStop={bucket === "running" ? () => handleStop(card) : undefined}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {isFiltering && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex h-[30px] w-full items-center justify-center text-[#AFAFAF] text-xs transition-colors hover:text-foreground"
              >
                {t("hidden", { count: total - shown })} — {t("clearFilter")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  bucket,
  count,
  active,
  onClick,
}: {
  bucket: Bucket;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("runningAgents");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-16 items-center justify-between rounded-[10px] border bg-card px-4 text-left transition-colors hover:border-muted-foreground/40 ${
        active ? "border-muted-foreground ring-1 ring-muted-foreground/60" : ""
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: BUCKET_DOT[bucket] }} />
          <span className="font-medium text-muted-foreground text-xs">{t(`tiles.${bucket}.label`)}</span>
        </span>
        <span className="text-[10px] text-muted-foreground/70">{t(`tiles.${bucket}.sub`)}</span>
      </div>
      <span className="font-semibold text-xl tabular-nums">{count}</span>
    </button>
  );
}

function RowMenu({ onView, onStop }: { onView: () => void; onStop?: () => void }) {
  const t = useTranslations("runningAgents");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground">
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onView}>
          <ScrollTextIcon className="size-3.5" />
          {t("viewOutput")}
        </DropdownMenuItem>
        {onStop && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onStop}>
              <SquareIcon className="size-3 fill-current" />
              {t("stop")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function latestRun(card: KanbanCard): AgentRun | undefined {
  return (
    card.runHistory?.find((r) => r.status === "running") ??
    card.runHistory?.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  );
}

function formatTriggered(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}

/** Run duration in ms — live while running, final once stopped; null if unknown. */
function durationMs(card: KanbanCard, run: AgentRun | undefined, now: number): number | null {
  const start = card.agentRunStartedAt ?? run?.startedAt;
  if (!start) return null;
  const end = card.status === "in_progress" ? now : Date.parse(run?.endedAt ?? card.agentRunEndedAt ?? "");
  const ms = (typeof end === "number" && !Number.isNaN(end) ? end : now) - Date.parse(start);
  return Number.isNaN(ms) || ms < 0 ? null : ms;
}

function formatDuration(card: KanbanCard, run: AgentRun | undefined, now: number): string {
  const ms = durationMs(card, run, now);
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function compareBy(
  key: SortKey,
  a: { card: KanbanCard; bucket: Bucket; run?: AgentRun; triggeredAt?: string },
  b: { card: KanbanCard; bucket: Bucket; run?: AgentRun; triggeredAt?: string },
  presetName: (c: KanbanCard) => string | undefined,
  now: number,
): number {
  switch (key) {
    case "task":
      return a.card.title.localeCompare(b.card.title);
    case "triggered":
      return (a.triggeredAt ?? "").localeCompare(b.triggeredAt ?? "");
    case "status":
      return BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket);
    case "duration":
      return (durationMs(a.card, a.run, now) ?? -1) - (durationMs(b.card, b.run, now) ?? -1);
    case "agent":
      return (presetName(a.card) ?? "").localeCompare(presetName(b.card) ?? "");
  }
}

function SortableHead({
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const t = useTranslations("runningAgents");
  const active = sortKey === column;
  return (
    <TableHead className={`h-10 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex w-full items-center justify-between gap-1 text-left"
      >
        <span>{t(`columns.${column}`)}</span>
        {/* Sort affordance: hidden until the table is hovered (group/table). */}
        <span
          className={`shrink-0 transition-opacity ${
            active ? "opacity-0 group-hover/table:opacity-100" : "opacity-0 group-hover/table:opacity-50"
          }`}
        >
          {active ? (
            sortDir === "desc" ? (
              <ArrowDownIcon className="size-3" />
            ) : (
              <ArrowUpIcon className="size-3" />
            )
          ) : (
            <ArrowUpDownIcon className="size-3" />
          )}
        </span>
      </button>
    </TableHead>
  );
}
