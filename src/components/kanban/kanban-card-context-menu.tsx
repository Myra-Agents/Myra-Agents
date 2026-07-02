"use client";

import type { ReactNode } from "react";

import {
  CircleStopIcon,
  ClipboardCheckIcon,
  MessageSquareIcon,
  MoveRightIcon,
  PencilIcon,
  ScrollTextIcon,
  TrashIcon,
  ZapIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { KanbanCard, KanbanStatus } from "@/types/kanban";
import { COLUMN_STATUSES, isTransitionAllowed } from "@/types/kanban";

interface KanbanCardContextMenuProps {
  card: KanbanCard;
  columnLabel: (status: KanbanStatus) => string;
  onEdit: () => void;
  onLaunch: () => void;
  onStop: () => void;
  onMove: (status: KanbanStatus) => void;
  onReview: () => void;
  onViewLogs?: () => void;
  onTrash: () => void;
  children: ReactNode;
}

/**
 * Right-click menu for a board card. Replaces the native WebKit menu (suppressed
 * globally by `DisableNativeContextMenu`) with theme-aware actions that mirror
 * the card's hover buttons plus a "Move to" submenu. Item availability follows
 * the same rules as the rest of the board: launch only when there's a prompt and
 * no run in flight; moves gated by `isTransitionAllowed`; review only in the two
 * attention states. Disabling the trigger's own `onContextMenu` short-circuit is
 * unnecessary — Radix already calls `preventDefault` before opening.
 */
export function KanbanCardContextMenu({
  card,
  columnLabel,
  onEdit,
  onLaunch,
  onStop,
  onMove,
  onReview,
  onViewLogs,
  onTrash,
  children,
}: KanbanCardContextMenuProps) {
  const t = useTranslations("kanban.card");

  const inFlight = card.status === "in_progress" || Boolean(card.agentRunId) || card.agentQueued;
  const canLaunch = Boolean(card.agentPrompt) && !inFlight;
  // Stop only when a run is actually active — `in_progress` or waiting for a
  // slot. `agentRunId` lingers on done/feedback cards (its last run), so it
  // can't gate this or Stop would show on cards whose process already exited.
  const isRunning = card.status === "in_progress" || Boolean(card.agentQueued);
  const needsReview = card.status === "waiting_feedback" || card.status === "awaiting_review";
  const moveTargets = COLUMN_STATUSES.filter(
    (status) => status !== card.status && status !== "trashed" && isTransitionAllowed(card.status, status),
  );

  // awaiting_review → in_progress is a re-run; route it through the review modal
  // (mirrors the board's drag handler) instead of a silent status flip.
  const handleMove = (status: KanbanStatus) => {
    if (status === "in_progress" && card.status === "awaiting_review") onReview();
    else onMove(status);
  };

  return (
    <ContextMenu>
      {/* Real DOM node as the trigger: the card is a function component that
          doesn't forward ref / spread unknown props, so `asChild` onto it would
          drop Radix's onContextMenu and the menu would never open. A passthrough
          div receives the bubbled contextmenu; dnd-kit drag stays on the card. */}
      <ContextMenuTrigger asChild>
        {/* Stop the contextmenu bubbling to the app-wide dev menu so the card
            menu wins on cards (Radix's own trigger preventDefaults but doesn't
            stop propagation). */}
        <div onContextMenu={(e) => e.stopPropagation()}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {/* Only draft tasks are editable. */}
        {card.status === "draft" && (
          <ContextMenuItem onSelect={onEdit}>
            <PencilIcon />
            {t("editCard")}
          </ContextMenuItem>
        )}

        {canLaunch && (
          <ContextMenuItem onSelect={onLaunch}>
            <ZapIcon />
            {t("launchAgent")}
          </ContextMenuItem>
        )}

        {/* Stop a live run (in progress or queued for a slot). */}
        {isRunning && (
          <ContextMenuItem onSelect={onStop}>
            <CircleStopIcon />
            {t("stop")}
          </ContextMenuItem>
        )}

        {needsReview && (
          <ContextMenuItem onSelect={onReview}>
            {card.status === "waiting_feedback" ? <MessageSquareIcon /> : <ClipboardCheckIcon />}
            {card.status === "waiting_feedback" ? t("answerFeedback") : t("review")}
          </ContextMenuItem>
        )}

        {onViewLogs && (
          <ContextMenuItem onSelect={onViewLogs}>
            <ScrollTextIcon />
            {t("viewLogs")}
          </ContextMenuItem>
        )}

        {moveTargets.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <MoveRightIcon />
                {t("moveTo")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {moveTargets.map((status) => (
                  <ContextMenuItem key={status} onSelect={() => handleMove(status)}>
                    {columnLabel(status)}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onTrash}>
          <TrashIcon />
          {t("moveToTrash")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
