"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { KanbanCard, KanbanStatus } from "@/types/kanban";
import { COLUMN_CONFIG } from "@/types/kanban";
import type { ScheduledTask } from "@/types/schedule";

import { KanbanCardComponent } from "./kanban-card";

interface KanbanColumnProps {
  status: KanbanStatus;
  label?: string;
  cards: KanbanCard[];
  onAddCard: () => void;
  onEditCard: (card: KanbanCard) => void;
  onTrashCard: (id: string) => void;
  onReviewCard: (card: KanbanCard) => void;
  selectedIds?: Set<string>;
  onSelectedChange?: (id: string, selected: boolean) => void;
  onViewLogs?: (card: KanbanCard) => void;
  logsByCard?: Map<string, string[]>;
  getSchedule?: (id: string | undefined) => ScheduledTask | undefined;
  invalidDropCardId?: string | null;
}

export function KanbanColumn({
  status,
  label,
  cards,
  onAddCard,
  onEditCard,
  onTrashCard,
  onReviewCard,
  selectedIds,
  onSelectedChange,
  onViewLogs,
  logsByCard,
  getSchedule,
  invalidDropCardId,
}: KanbanColumnProps) {
  const t = useTranslations("kanban");
  const config = COLUMN_CONFIG[status];
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { type: "column", status } });
  const cardIds = cards.map((c) => c.id);
  const emptyHints: Record<KanbanStatus, string> = {
    draft: t("empty.draft"),
    todo: t("empty.todo"),
    in_progress: t("empty.inProgress"),
    waiting_feedback: t("empty.waitingFeedback"),
    awaiting_review: t("empty.awaitingReview"),
    done: t("empty.done"),
    trashed: t("empty.dropHere"),
  };

  return (
    <div className="flex flex-col flex-1 basis-0 min-w-[15rem] max-w-[20rem]">
      {/* Column header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full ${config.accentBar}`} />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
            {label ?? config.label}
          </h3>
        </div>
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {cards.length}
        </Badge>
      </div>

      {/* Cards area — droppable */}
      <div
        ref={setNodeRef}
        className={[
          "flex-1 flex flex-col gap-2 p-2 min-h-32 rounded-lg border border-dashed transition-colors duration-200",
          isOver ? "border-primary/50 bg-primary/5" : "border-transparent bg-muted/30",
        ].join(" ")}
      >
        {cards.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground italic text-center">
              {isOver ? t("empty.dropHere") : emptyHints[status]}
            </p>
          </div>
        )}
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCardComponent
              key={card.id}
              card={card}
              onEdit={() => onEditCard(card)}
              onTrash={() => onTrashCard(card.id)}
              onReview={() => onReviewCard(card)}
              selected={selectedIds?.has(card.id)}
              onSelectedChange={onSelectedChange ? (selected) => onSelectedChange(card.id, selected) : undefined}
              onViewLogs={onViewLogs ? () => onViewLogs(card) : undefined}
              logLines={logsByCard?.get(card.id)}
              schedule={getSchedule?.(card.linkedTaskId)}
              isShaking={invalidDropCardId === card.id}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add card button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onAddCard}
        className="mt-2 w-full text-muted-foreground hover:text-foreground"
      >
        <PlusIcon className="size-3.5" />
        <span className="text-xs">{t("card.addCard")}</span>
      </Button>
    </div>
  );
}
