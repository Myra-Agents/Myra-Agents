import { useEffect } from "react";

import { ensureBoardLive, useBoardStore } from "@/stores/board-store";
import type { AgentPreset } from "@/types/settings";

/**
 * Thin selector over the global {@link useBoardStore}. The board is now a single
 * app-wide store fed by push events (`agent-result-changed`, `agent-log-appended`)
 * and connection topology — so every screen auto-reflects changes in real time
 * with no polling and no per-page re-subscription. The returned API is unchanged
 * from the original per-component hook.
 *
 * @param presets agent presets, used only to enrich analytics on add/launch.
 */
export function useKanban(presets: AgentPreset[] = []) {
  const cards = useBoardStore((s) => s.cards);
  const loading = useBoardStore((s) => s.loading);
  const error = useBoardStore((s) => s.error);
  const cancellingIds = useBoardStore((s) => s.cancellingIds);

  const addCard = useBoardStore((s) => s.addCard);
  const updateCard = useBoardStore((s) => s.updateCard);
  const moveCard = useBoardStore((s) => s.moveCard);
  const reorderCard = useBoardStore((s) => s.reorderCard);
  const deleteCard = useBoardStore((s) => s.deleteCard);
  const trashCard = useBoardStore((s) => s.trashCard);
  const restoreCard = useBoardStore((s) => s.restoreCard);
  const addRevisionNote = useBoardStore((s) => s.addRevisionNote);
  const answerFeedback = useBoardStore((s) => s.answerFeedback);
  const launchAgent = useBoardStore((s) => s.launchAgent);
  const cancelAgent = useBoardStore((s) => s.cancelAgent);
  const upsertCard = useBoardStore((s) => s.upsertCard);
  const reload = useBoardStore((s) => s.loadCards);
  const setPresets = useBoardStore((s) => s.setPresets);

  // Start the global data load + live subscriptions once (idempotent).
  useEffect(() => {
    ensureBoardLive();
  }, []);

  // Keep the store's presets fresh for analytics props on add/launch.
  useEffect(() => {
    if (presets.length) setPresets(presets);
  }, [presets, setPresets]);

  return {
    cards,
    loading,
    error,
    addCard,
    updateCard,
    moveCard,
    reorderCard,
    deleteCard,
    trashCard,
    restoreCard,
    addRevisionNote,
    answerFeedback,
    launchAgent,
    cancelAgent,
    cancellingIds,
    upsertCard,
    reload,
  };
}
