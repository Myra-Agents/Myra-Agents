import { useCallback, useEffect, useState } from "react";

import { invoke, isDevModeError } from "@/lib/tauri";
import type { CreateCardInput, KanbanCard, KanbanStatus, UpdateCardInput } from "@/types/kanban";

export function useKanban() {
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    try {
      setError(null);
      const data = await invoke<KanbanCard[]>("get_cards");
      setCards(data);
    } catch (e) {
      if (!isDevModeError(e)) {
        console.error("Failed to load cards:", e);
        setError(String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const upsertCard = useCallback((card: KanbanCard) => {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === card.id);
      if (idx === -1) return [...prev, card];
      const next = prev.slice();
      next[idx] = card;
      return next;
    });
  }, []);

  const addCard = useCallback(async (input: CreateCardInput) => {
    const card = await invoke<KanbanCard>("add_card", { input });
    setCards((prev) => [...prev, card]);
    return card;
  }, []);

  const updateCard = useCallback(
    async (input: UpdateCardInput) => {
      const card = await invoke<KanbanCard | null>("update_card", { input });
      if (card) upsertCard(card);
      return card;
    },
    [upsertCard],
  );

  const moveCard = useCallback(
    async (id: string, status: KanbanStatus) => {
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      try {
        const card = await invoke<KanbanCard | null>("move_card", { id, status });
        if (card) upsertCard(card);
        return card;
      } catch (e) {
        await loadCards();
        throw e;
      }
    },
    [loadCards, upsertCard],
  );

  const reorderCard = useCallback(
    async (id: string, newPosition: number, status?: KanbanStatus) => {
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, position: newPosition, ...(status ? { status } : {}) } : c)),
      );
      try {
        const card = await invoke<KanbanCard | null>("reorder_card", {
          id,
          newPosition,
          status: status ?? null,
        });
        if (card) upsertCard(card);
        return card;
      } catch (e) {
        await loadCards();
        throw e;
      }
    },
    [loadCards, upsertCard],
  );

  const deleteCard = useCallback(async (id: string) => {
    const success = await invoke<boolean>("delete_card", { id });
    if (success) setCards((prev) => prev.filter((c) => c.id !== id));
    return success;
  }, []);

  const trashCard = useCallback(
    async (id: string) => {
      const card = await invoke<KanbanCard | null>("trash_card", { id });
      if (card) upsertCard(card);
      return card;
    },
    [upsertCard],
  );

  const restoreCard = useCallback(
    async (id: string, status?: KanbanStatus) => {
      const card = await invoke<KanbanCard | null>("restore_card", {
        id,
        status: status ?? null,
      });
      if (card) upsertCard(card);
      return card;
    },
    [upsertCard],
  );

  const addRevisionNote = useCallback(
    async (id: string, note: string) => {
      const card = await invoke<KanbanCard | null>("add_revision_note", {
        input: { id, note },
      });
      if (card) upsertCard(card);
      return card;
    },
    [upsertCard],
  );

  const answerFeedback = useCallback(
    async (id: string, answer: string) => {
      const card = await invoke<KanbanCard | null>("answer_feedback", {
        input: { id, answer },
      });
      if (card) upsertCard(card);
      return card;
    },
    [upsertCard],
  );

  const launchAgent = useCallback(
    async (cardId: string, workingDir?: string) => {
      try {
        const runId = await invoke<string>("launch_agent", {
          input: {
            cardId,
            workingDir: workingDir ?? null,
          },
        });
        const now = new Date().toISOString();
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? {
                  ...card,
                  status: "in_progress",
                  agentRunId: runId,
                  agentRunStartedAt: now,
                  agentRunEndedAt: undefined,
                  agentResult: undefined,
                  agentQuestion: undefined,
                  updatedAt: now,
                }
              : card,
          ),
        );
        return runId;
      } catch (e) {
        await loadCards();
        throw e;
      }
    },
    [loadCards],
  );

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
    upsertCard,
    reload: loadCards,
  };
}
