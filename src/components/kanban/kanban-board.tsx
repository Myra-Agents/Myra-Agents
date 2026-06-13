"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ColumnPreferences } from "@/hooks/use-column-preferences";
import { connIdOf } from "@/lib/aggregate/global-id";
import { normalizeTag, tagClassName } from "@/lib/kanban-tags";
import type { KanbanCard, KanbanStatus } from "@/types/kanban";
import { COLUMN_STATUSES, isTransitionAllowed } from "@/types/kanban";
import type { ScheduledTask } from "@/types/schedule";
import type { AgentPreset } from "@/types/settings";

import { KanbanCardComponent } from "./kanban-card";
import { KanbanColumn } from "./kanban-column";
import { TrashDropZone } from "./trash-zone";

interface KanbanBoardProps {
  cards: KanbanCard[];
  onAddCard: (status: KanbanStatus) => void;
  onEditCard: (card: KanbanCard) => void;
  onTrashCard: (id: string) => void | Promise<unknown>;
  onBulkTrash: (ids: string[]) => void | Promise<unknown>;
  onRestoreCard: (id: string, status?: KanbanStatus) => void;
  onPurgeCard: (id: string) => void;
  onMoveCard: (id: string, status: KanbanStatus) => void | Promise<unknown>;
  onReorderCard: (id: string, newPosition: number, status?: KanbanStatus) => void;
  onReviewCard: (card: KanbanCard) => void;
  onOpenConversation: (card: KanbanCard) => void;
  onBulkAddTag: (card: KanbanCard, tag: string) => Promise<void>;
  onBulkLaunch: (card: KanbanCard) => Promise<void>;
  onViewLogs?: (card: KanbanCard) => void;
  logsByCard?: Map<string, string[]>;
  getSchedule?: (id: string | undefined) => ScheduledTask | undefined;
  agentPresets?: AgentPreset[];
  defaultAgentId?: string;
  columnPreferences: ColumnPreferences;
  onColumnHiddenChange: (status: KanbanStatus, hidden: boolean) => void;
  onColumnLabelChange: (status: KanbanStatus, label: string) => void;
  onResetColumnPreferences: () => void;
}

const TRASH_DROP_ID = "trashed";
type StatusFilter = "all" | KanbanStatus;
type DateFilter = "all" | "today" | "7d" | "30d";
const noop = () => undefined;
const COLUMN_MESSAGE_KEYS: Record<KanbanStatus, string> = {
  draft: "draft",
  todo: "todo",
  in_progress: "inProgress",
  waiting_feedback: "waitingFeedback",
  awaiting_review: "awaitingReview",
  done: "done",
  trashed: "trashed",
};

export function KanbanBoard({
  cards,
  onAddCard,
  onEditCard,
  onTrashCard,
  onBulkTrash,
  onMoveCard,
  onReorderCard,
  onReviewCard,
  onOpenConversation,
  onBulkAddTag,
  onBulkLaunch,
  onViewLogs,
  logsByCard,
  getSchedule,
  agentPresets = [],
  defaultAgentId,
  columnPreferences,
  onColumnHiddenChange,
  onColumnLabelChange,
  onResetColumnPreferences,
}: KanbanBoardProps) {
  const t = useTranslations("kanban");
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [invalidDropId, setInvalidDropId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<KanbanStatus>("todo");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canPan, setCanPan] = useState(false);

  // Track whether the scroll container actually has horizontal overflow,
  // so we only show the grab cursor when panning is useful.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setCanPan(el.scrollWidth > el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const observeChildren = () => {
      for (const child of Array.from(el.children)) ro.observe(child);
    };
    observeChildren();
    const mo = new MutationObserver(() => {
      observeChildren();
      update();
    });
    mo.observe(el, { childList: true });
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Trello-like mouse panning on the kanban board's empty space.
  // - Wheel: left as-is. Vertical wheel scrolls vertically, Shift+wheel
  //   scrolls horizontally (browser default).
  // - Middle-click drag: pans in both axes.
  // - Left-click drag on empty space (not on a card / button / input)
  //   pans in both axes. dnd-kit owns drags that start on cards.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isInteractive = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      // Anything draggable by dnd-kit, or any real interactive control,
      // should NOT trigger panning.
      return Boolean(
        target.closest(
          "[data-kanban-card], [data-dnd-kit-draggable], button, a, input, textarea, select, [role='button'], [contenteditable='true']",
        ),
      );
    };

    // ----- Pointer-based panning (middle click anywhere, left click on empty) -----
    let panning = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let prevCursor = "";
    let prevUserSelect = "";

    const onPointerDown = (e: PointerEvent) => {
      const middle = e.button === 1;
      const left = e.button === 0;
      if (!middle && !left) return;
      if (left && isInteractive(e.target)) return;

      panning = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = el.scrollLeft;
      startScrollTop = el.scrollTop;
      prevCursor = el.style.cursor;
      prevUserSelect = document.body.style.userSelect;
      el.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (middle) e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!panning || e.pointerId !== pointerId) return;
      el.scrollLeft = startScrollLeft - (e.clientX - startX);
      el.scrollTop = startScrollTop - (e.clientY - startY);
    };

    const endPan = (e: PointerEvent) => {
      if (!panning || e.pointerId !== pointerId) return;
      panning = false;
      pointerId = null;
      el.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    // Suppress the middle-click autoscroll bubble.
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endPan);
    el.addEventListener("pointercancel", endPan);
    el.addEventListener("auxclick", onAuxClick);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endPan);
      el.removeEventListener("pointercancel", endPan);
      el.removeEventListener("auxclick", onAuxClick);
    };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const visibleCards = useMemo(
    () =>
      cards
        .filter((c) => c.status !== "trashed")
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [cards],
  );

  const cardById = useMemo(() => {
    const m = new Map<string, KanbanCard>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const card of visibleCards) {
      for (const tag of card.tags) tags.add(normalizeTag(tag));
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [visibleCards]);

  const attentionStatuses = useMemo(() => {
    const statuses = new Set<KanbanStatus>();
    for (const card of visibleCards) {
      if (card.status === "waiting_feedback" || card.status === "awaiting_review") {
        statuses.add(card.status);
      }
    }
    return statuses;
  }, [visibleCards]);

  const getColumnLabel = (status: KanbanStatus) =>
    columnPreferences.labels[status]?.trim() || t(`columns.${COLUMN_MESSAGE_KEYS[status]}`);

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visibleCards.filter((card) => {
      if (statusFilter !== "all" && card.status !== statusFilter) return false;
      if (tagFilters.length > 0 && !tagFilters.some((tag) => card.tags.map(normalizeTag).includes(tag))) return false;
      if (agentFilter !== "all" && (card.agentPresetId ?? defaultAgentId ?? "") !== agentFilter) return false;
      if (attentionOnly && card.status !== "waiting_feedback" && card.status !== "awaiting_review") return false;
      if (activeOnly && card.status !== "in_progress") return false;
      if (!matchesDateFilter(card, dateFilter)) return false;

      if (!needle) return true;
      return [
        card.title,
        card.description,
        card.agentPrompt,
        card.agentResult,
        card.agentQuestion,
        ...(card.tags ?? []),
        ...(card.revisionNotes ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [
    activeOnly,
    agentFilter,
    attentionOnly,
    dateFilter,
    defaultAgentId,
    query,
    statusFilter,
    tagFilters,
    visibleCards,
  ]);

  const visibleColumns = useMemo(() => {
    if (statusFilter !== "all") return COLUMN_STATUSES.filter((status) => status === statusFilter);
    const columns = COLUMN_STATUSES.filter(
      (status) => !columnPreferences.hiddenStatuses.includes(status) || attentionStatuses.has(status),
    );
    return columns.length > 0 ? columns : COLUMN_STATUSES;
  }, [attentionStatuses, columnPreferences.hiddenStatuses, statusFilter]);

  const hasFilters = [
    query.trim() !== "",
    statusFilter !== "all",
    tagFilters.length > 0,
    agentFilter !== "all",
    dateFilter !== "all",
    attentionOnly,
    activeOnly,
  ].some(Boolean);

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTagFilters([]);
    setAgentFilter("all");
    setDateFilter("all");
    setAttentionOnly(false);
    setActiveOnly(false);
  };

  const selectedCards = useMemo(
    () => visibleCards.filter((card) => selectedIds.has(card.id)),
    [selectedIds, visibleCards],
  );

  useEffect(() => {
    const filteredIds = new Set(filteredCards.map((card) => card.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => filteredIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredCards]);

  const setCardSelected = (id: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleTagFilter = (tag: string) => {
    setTagFilters((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  const runBulkAction = async (action: () => Promise<void>) => {
    setBulkBusy(true);
    try {
      await action();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkMove = () =>
    runBulkAction(async () => {
      const movable = selectedCards.filter(
        (card) => card.status !== bulkStatus && isTransitionAllowed(card.status, bulkStatus),
      );
      if (movable.length === 0) {
        toast.error(t("bulk.noMovable"));
        return;
      }
      for (const card of movable) {
        await onMoveCard(card.id, bulkStatus);
      }
      const skipped = selectedCards.length - movable.length;
      toast.success(t("bulk.moved", { count: movable.length, skipped }));
      setSelectedIds(new Set());
    });

  const handleBulkTrash = () =>
    runBulkAction(async () => {
      await onBulkTrash(selectedCards.map((card) => card.id));
      setSelectedIds(new Set());
    });

  const handleBulkAddTag = () =>
    runBulkAction(async () => {
      const tag = normalizeTag(bulkTag);
      if (!tag) return;
      for (const card of selectedCards) {
        await onBulkAddTag(card, tag);
      }
      toast.success(t("bulk.tagged", { count: selectedCards.length, tag }));
      setBulkTag("");
    });

  const handleBulkLaunch = () =>
    runBulkAction(async () => {
      const launchable = selectedCards.filter((card) => card.status !== "in_progress" && !card.agentRunId);
      if (launchable.length === 0) {
        toast.error(t("bulk.noLaunchable"));
        return;
      }
      for (const card of launchable) {
        await onBulkLaunch(card);
      }
      const skipped = selectedCards.length - launchable.length;
      toast.success(t("bulk.launched", { count: launchable.length, skipped }));
      setSelectedIds(new Set());
    });

  const handleExportSelection = () => {
    const blob = new Blob([JSON.stringify(selectedCards, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `myra-agents-selection-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const card = cards.find((c) => c.id === event.active.id);
    setActiveCard(card ?? null);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled via CSS :data-[over] in columns
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const cardId = active.id as string;
    const overId = over.id as string;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    // Trash zone
    if (overId === TRASH_DROP_ID) {
      if (card.status !== "trashed") void onTrashCard(cardId);
      return;
    }

    // Determine target column
    const isOverColumn = (COLUMN_STATUSES as readonly string[]).includes(overId);
    const overCard = isOverColumn ? null : (cardById.get(overId) ?? null);
    const targetStatus: KanbanStatus | null = isOverColumn
      ? (overId as KanbanStatus)
      : overCard
        ? (overCard.status as KanbanStatus)
        : null;
    if (!targetStatus) return;

    // Same column reorder — disallowed across servers (positions are per-server).
    if (targetStatus === card.status) {
      if (!overCard || overCard.id === cardId) return;
      if (connIdOf(overCard.id) !== connIdOf(cardId)) {
        setInvalidDropId(cardId);
        setTimeout(() => setInvalidDropId(null), 450);
        return;
      }
      const sameServer = visibleCards.filter((c) => connIdOf(c.id) === connIdOf(cardId));
      const newPosition = computeInsertPosition(sameServer, targetStatus, cardId, overCard.id);
      onReorderCard(cardId, newPosition);
      return;
    }

    // Cross-column move
    if (!isTransitionAllowed(card.status, targetStatus)) {
      setInvalidDropId(cardId);
      setTimeout(() => setInvalidDropId(null), 450);
      return;
    }

    // awaiting_review → in_progress goes through review modal
    if (card.status === "awaiting_review" && targetStatus === "in_progress") {
      onReviewCard(card);
      return;
    }

    void onMoveCard(cardId, targetStatus);
  };

  const isDragging = activeCard !== null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="space-y-3 px-4 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              id="card-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              className="w-full sm:w-auto sm:min-w-[16rem] sm:flex-1"
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t("filters.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
                {COLUMN_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`columns.${COLUMN_MESSAGE_KEYS[status]}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t("filters.agent")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allAgents")}</SelectItem>
                {agentPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={(value) => setDateFilter(value as DateFilter)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t("filters.date")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allDates")}</SelectItem>
                <SelectItem value="today">{t("filters.today")}</SelectItem>
                <SelectItem value="7d">{t("filters.last7Days")}</SelectItem>
                <SelectItem value="30d">{t("filters.last30Days")}</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  {t("columnsMenu.title")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3">
                <div>
                  <h4 className="font-medium text-sm">{t("columnsMenu.title")}</h4>
                  <p className="text-muted-foreground text-xs">{t("columnsMenu.description")}</p>
                </div>
                <div className="space-y-2">
                  {COLUMN_STATUSES.map((status) => {
                    const attentionProtected = attentionStatuses.has(status);
                    const hidden = columnPreferences.hiddenStatuses.includes(status) && !attentionProtected;
                    return (
                      <div key={status} className="grid grid-cols-[auto_1fr] items-center gap-2">
                        <Checkbox
                          checked={!hidden}
                          disabled={attentionProtected}
                          onCheckedChange={(checked) => onColumnHiddenChange(status, checked !== true)}
                          aria-label={t("columnsMenu.showColumn", { column: getColumnLabel(status) })}
                        />
                        <Input
                          value={columnPreferences.labels[status] ?? ""}
                          onChange={(event) => onColumnLabelChange(status, event.target.value)}
                          placeholder={t("columnsMenu.labelPlaceholder", {
                            column: t(`columns.${COLUMN_MESSAGE_KEYS[status]}`),
                          })}
                          className="h-8"
                        />
                      </div>
                    );
                  })}
                </div>
                {attentionStatuses.size > 0 && (
                  <p className="text-muted-foreground text-xs">{t("columnsMenu.attentionProtected")}</p>
                )}
                <Button variant="secondary" size="sm" onClick={onResetColumnPreferences}>
                  {t("columnsMenu.reset")}
                </Button>
              </PopoverContent>
            </Popover>
            <Button variant="outline" onClick={resetFilters} disabled={!hasFilters} className="w-full sm:w-auto">
              {t("filters.clear")}
            </Button>
          </div>

          {tagOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-muted-foreground text-xs">{t("filters.tagsMatchAny")}</span>
              {tagOptions.map((tag) => (
                <button key={tag} type="button" onClick={() => toggleTagFilter(tag)}>
                  <Badge
                    variant="outline"
                    className={tagClassName(
                      tag,
                      tagFilters.includes(tag) ? "ring-2 ring-primary/40" : "opacity-75 hover:opacity-100",
                    )}
                  >
                    {tag}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
            <div className="flex flex-wrap gap-2">
              <Button
                size="xs"
                variant={attentionOnly ? "default" : "outline"}
                onClick={() => setAttentionOnly((current) => !current)}
              >
                {t("filters.attentionOnly")}
              </Button>
              <Button
                size="xs"
                variant={activeOnly ? "default" : "outline"}
                onClick={() => setActiveOnly((current) => !current)}
              >
                {t("filters.activeOnly")}
              </Button>
            </div>
            <span>
              {t("filters.showing", {
                visible: filteredCards.length,
                total: visibleCards.length,
              })}
            </span>
          </div>

          {selectedCards.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
              <span className="px-1 font-medium text-sm">{t("bulk.selected", { count: selectedCards.length })}</span>
              <Select value={bulkStatus} onValueChange={(value) => setBulkStatus(value as KanbanStatus)}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder={t("bulk.moveTo")} />
                </SelectTrigger>
                <SelectContent>
                  {COLUMN_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getColumnLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={handleBulkMove} disabled={bulkBusy}>
                {t("bulk.move")}
              </Button>
              <Input
                value={bulkTag}
                onChange={(event) => setBulkTag(event.target.value)}
                placeholder={t("bulk.addTagPlaceholder")}
                className="h-8 w-44"
              />
              <Button size="sm" variant="secondary" onClick={handleBulkAddTag} disabled={bulkBusy || !bulkTag.trim()}>
                {t("bulk.addTag")}
              </Button>
              <Button size="sm" onClick={handleBulkLaunch} disabled={bulkBusy}>
                {t("bulk.launch")}
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportSelection}>
                {t("bulk.export")}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkTrash} disabled={bulkBusy}>
                {t("bulk.trash")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                {t("bulk.clear")}
              </Button>
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          className={`flex h-full min-h-0 items-start gap-3 overflow-x-auto overflow-y-hidden px-4 py-4 ${canPan ? "cursor-grab" : ""}`}
        >
          {visibleColumns.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              label={getColumnLabel(status)}
              cards={filteredCards.filter((c) => c.status === status)}
              onAddCard={() => onAddCard(status)}
              onEditCard={onEditCard}
              onTrashCard={onTrashCard}
              onReviewCard={onReviewCard}
              onOpenConversation={onOpenConversation}
              onLaunchCard={onBulkLaunch}
              onMoveCard={onMoveCard}
              columnLabel={getColumnLabel}
              selectedIds={selectedIds}
              onSelectedChange={setCardSelected}
              onViewLogs={onViewLogs}
              logsByCard={logsByCard}
              getSchedule={getSchedule}
              invalidDropCardId={invalidDropId}
            />
          ))}
        </div>
      </div>

      <TrashDropZone dropId={TRASH_DROP_ID} visible={isDragging} />

      <DragOverlay dropAnimation={null}>
        {activeCard && (
          <KanbanCardComponent
            card={activeCard}
            onEdit={noop}
            onTrash={noop}
            onReview={noop}
            logLines={logsByCard?.get(activeCard.id)}
            isOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function matchesDateFilter(card: KanbanCard, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const date = Date.parse(card.updatedAt);
  if (Number.isNaN(date)) return true;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (filter === "today") return date >= start.getTime();

  const days = filter === "7d" ? 7 : 30;
  return date >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

function computeInsertPosition(
  visibleCards: KanbanCard[],
  status: KanbanStatus,
  movingId: string,
  targetId: string,
): number {
  const column = visibleCards
    .filter((c) => c.status === status && c.id !== movingId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const idx = column.findIndex((c) => c.id === targetId);
  if (idx === -1) {
    const last = column[column.length - 1];
    return (last?.position ?? 0) + 1000;
  }

  const fullColumn = visibleCards
    .filter((c) => c.status === status)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const movingOriginalIdx = fullColumn.findIndex((c) => c.id === movingId);
  const targetOriginalIdx = fullColumn.findIndex((c) => c.id === targetId);

  let prev: KanbanCard | undefined;
  let next: KanbanCard | undefined;
  if (movingOriginalIdx !== -1 && movingOriginalIdx < targetOriginalIdx) {
    prev = column[idx];
    next = column[idx + 1];
  } else {
    prev = column[idx - 1];
    next = column[idx];
  }

  const prevPos = prev?.position ?? 0;
  const nextPos = next?.position ?? prevPos + 2000;
  return (prevPos + nextPos) / 2;
}
