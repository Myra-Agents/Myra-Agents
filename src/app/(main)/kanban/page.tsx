"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { CardModal } from "@/components/kanban/card-modal";
import { FeedbackModal, ReviewModal } from "@/components/kanban/feedback-modal";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { useAgentEvents } from "@/hooks/use-agent-events";
import { useAgentLogs } from "@/hooks/use-agent-logs";
import { useCardTemplates } from "@/hooks/use-card-templates";
import { useColumnPreferences } from "@/hooks/use-column-preferences";
import { useConnections } from "@/hooks/use-connections";
import { useKanban } from "@/hooks/use-kanban";
import { useSchedules } from "@/hooks/use-schedules";
import { useSettings } from "@/hooks/use-settings";
import { connIdOf, parseGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { normalizeTag, parseTags } from "@/lib/kanban-tags";
import { invokeOn } from "@/lib/tauri";
import { useShortcutStore } from "@/stores/shortcut-store";
import type { CardFormData, KanbanCard, KanbanStatus } from "@/types/kanban";

export default function KanbanPage() {
  const t = useTranslations("kanban");
  const {
    cards,
    loading,
    error,
    addCard,
    updateCard,
    moveCard,
    reorderCard,
    trashCard,
    restoreCard,
    deleteCard,
    addRevisionNote,
    answerFeedback,
    launchAgent,
    upsertCard,
  } = useKanban();

  const { logs } = useAgentLogs();
  const { byId } = useSchedules();
  const { settings } = useSettings();
  const { isVisible } = useConnections();
  const { templates, saveTemplate } = useCardTemplates();
  const {
    preferences: columnPreferences,
    setColumnHidden,
    setColumnLabel,
    resetColumnPreferences,
  } = useColumnPreferences();

  useAgentEvents(upsertCard);

  // Drop cards from connections the user has hidden via the connection switcher.
  const visibleCards = useMemo(() => cards.filter((c) => isVisible(connIdOf(c.id))), [cards, isVisible]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const card of visibleCards) {
      for (const tag of card.tags) tags.add(normalizeTag(tag));
    }
    return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [visibleCards]);

  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [cardModalMode, setCardModalMode] = useState<"add" | "edit">("add");
  const [cardModalStatus, setCardModalStatus] = useState<KanbanStatus>("draft");
  const [editingCard, setEditingCard] = useState<KanbanCard | undefined>();

  const [feedbackCard, setFeedbackCard] = useState<KanbanCard | null>(null);
  const [reviewCard, setReviewCard] = useState<KanbanCard | null>(null);

  const handleAddCard = useCallback((status: KanbanStatus) => {
    setCardModalMode("add");
    setCardModalStatus(status);
    setEditingCard(undefined);
    setCardModalOpen(true);
  }, []);

  const handleTrashCard = useCallback(
    async (id: string) => {
      await trashCard(id);
      toast.success(t("toast.trashed"), {
        action: { label: t("toast.undo"), onClick: () => void restoreCard(id) },
      });
    },
    [trashCard, restoreCard, t],
  );

  const handleBulkTrash = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => trashCard(id)));
      toast.success(t("bulk.trashed", { count: ids.length }), {
        action: { label: t("toast.undo"), onClick: () => ids.forEach((id) => void restoreCard(id)) },
      });
    },
    [trashCard, restoreCard, t],
  );

  const handleEditCard = useCallback((card: KanbanCard) => {
    setCardModalMode("edit");
    setEditingCard(card);
    setCardModalOpen(true);
  }, []);

  const handleSaveCard = useCallback(
    async (data: CardFormData, status: KanbanStatus, targetConnId?: string) => {
      const parsedTags = parseTags(data.tags);
      const agentPresetId = data.agentPresetId ?? editingCard?.agentPresetId ?? settings.defaultAgentId;

      if (cardModalMode === "add") {
        await addCard(
          {
            title: data.title,
            description: data.description || undefined,
            agentPrompt: data.agentPrompt || undefined,
            agentPresetId,
            workingDir: data.workingDir,
            tags: parsedTags,
            status,
          },
          targetConnId,
        );
      } else if (editingCard) {
        await updateCard({
          id: editingCard.id,
          title: data.title,
          description: data.description || undefined,
          agentPrompt: data.agentPrompt || undefined,
          agentPresetId,
          workingDir: data.workingDir,
          tags: parsedTags,
        });
      }
    },
    [addCard, cardModalMode, editingCard, settings.defaultAgentId, updateCard],
  );

  const handleLaunchFromModal = useCallback(
    async (cardId: string) => {
      const result = await launchAgent(cardId);
      if (result?.queued) toast.info(t("toast.queued"));
    },
    [launchAgent, t],
  );

  const handleOpenWorkingDir = useCallback(async (cardId: string) => {
    const { connId, entityId } = parseGlobalId(cardId);
    try {
      await invokeOn(connId, "open_card_working_dir", { cardId: entityId });
    } catch (e) {
      toast.error(String(e));
    }
  }, []);

  const handleBulkAddTag = useCallback(
    async (card: KanbanCard, tag: string) => {
      const tags = [...new Set([...card.tags.map(normalizeTag), normalizeTag(tag)])].filter(Boolean);
      await updateCard({
        id: card.id,
        title: card.title,
        description: card.description,
        agentPrompt: card.agentPrompt,
        agentPresetId: card.agentPresetId ?? settings.defaultAgentId,
        workingDir: card.workingDir,
        tags,
      });
    },
    [settings.defaultAgentId, updateCard],
  );

  const handleBulkLaunch = useCallback(
    async (card: KanbanCard) => {
      await launchAgent(card.id);
    },
    [launchAgent],
  );

  const handleReviewCard = useCallback((card: KanbanCard) => {
    if (card.status === "waiting_feedback") {
      setFeedbackCard(card);
    } else if (card.status === "awaiting_review") {
      setReviewCard(card);
    }
  }, []);

  const handleApprove = useCallback(
    async (id: string) => {
      await moveCard(id, "done");
    },
    [moveCard],
  );

  const handleRevise = useCallback(
    async (id: string, note: string) => {
      await addRevisionNote(id, note);
    },
    [addRevisionNote],
  );

  // --- Global keyboard shortcut intents (detected in the (main) layout) ---
  const pendingNewCard = useShortcutStore((s) => s.pendingNewCard);
  const consumeNewCard = useShortcutStore((s) => s.consumeNewCard);
  const focusSearchNonce = useShortcutStore((s) => s.focusSearchNonce);
  const cancelNonce = useShortcutStore((s) => s.cancelNonce);
  // Seed refs with the nonce at mount so the effects don't fire on first render.
  const lastFocusSearch = useRef(focusSearchNonce);
  const lastCancel = useRef(cancelNonce);

  // Consume the persistent flag: fires whether set on this page (shortcut) or
  // before navigation (sidebar/global shortcut from another route).
  useEffect(() => {
    if (!pendingNewCard) return;
    consumeNewCard();
    handleAddCard("draft");
  }, [pendingNewCard, consumeNewCard, handleAddCard]);

  useEffect(() => {
    if (lastFocusSearch.current === focusSearchNonce) return;
    lastFocusSearch.current = focusSearchNonce;
    document.getElementById("card-search")?.focus();
  }, [focusSearchNonce]);

  useEffect(() => {
    if (lastCancel.current === cancelNonce) return;
    lastCancel.current = cancelNonce;
    if (!cardModalOpen || !editingCard) return;
    const card = cards.find((c) => c.id === editingCard.id);
    if (!card || (!card.agentRunId && !card.agentQueued)) return;
    const { connId, entityId } = parseGlobalId(card.id);
    void invokeOn(connId, "cancel_agent", { cardId: entityId })
      .then(() => toast.success(t("toast.canceled")))
      .catch((e) => toast.error(String(e)));
  }, [cancelNonce, cardModalOpen, editingCard, cards, t]);

  // Adaptive log cadence (P6): only the card whose modal is open has a live
  // viewer, so tell its backend to stream that card's log lines and let every
  // other (headless/scheduled) run go quiet. Closing the modal clears the set.
  useEffect(() => {
    const watched = cardModalOpen && editingCard ? [editingCard.id] : [];
    void connectionManager.setLogWatch(watched);
  }, [cardModalOpen, editingCard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <KanbanBoard
        cards={visibleCards}
        onAddCard={handleAddCard}
        onEditCard={handleEditCard}
        onTrashCard={handleTrashCard}
        onBulkTrash={handleBulkTrash}
        onRestoreCard={restoreCard}
        onPurgeCard={deleteCard}
        onMoveCard={moveCard}
        onReorderCard={reorderCard}
        onReviewCard={handleReviewCard}
        onBulkAddTag={handleBulkAddTag}
        onBulkLaunch={handleBulkLaunch}
        logsByCard={logs}
        getSchedule={byId}
        agentPresets={settings.agents}
        defaultAgentId={settings.defaultAgentId}
        columnPreferences={columnPreferences}
        onColumnHiddenChange={setColumnHidden}
        onColumnLabelChange={setColumnLabel}
        onResetColumnPreferences={resetColumnPreferences}
      />

      <CardModal
        open={cardModalOpen}
        mode={cardModalMode}
        initialStatus={cardModalStatus}
        card={editingCard}
        availableTags={availableTags}
        templates={templates}
        agentPresets={settings.agents}
        defaultAgentId={settings.defaultAgentId}
        onSave={handleSaveCard}
        onSaveTemplate={saveTemplate}
        onLaunch={handleLaunchFromModal}
        onOpenWorkingDir={handleOpenWorkingDir}
        onClose={() => setCardModalOpen(false)}
      />

      <FeedbackModal
        open={feedbackCard !== null}
        card={feedbackCard}
        onSubmit={async (id, answer) => {
          await answerFeedback(id, answer);
        }}
        onClose={() => setFeedbackCard(null)}
      />

      <ReviewModal
        open={reviewCard !== null}
        card={reviewCard}
        onApprove={handleApprove}
        onRevise={handleRevise}
        onClose={() => setReviewCard(null)}
      />
    </div>
  );
}
