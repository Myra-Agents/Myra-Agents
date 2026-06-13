import { useCallback, useEffect, useState } from "react";

import { parseGlobalId, toGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { agentProps } from "@/lib/posthog/agent-props";
import { captureError, track } from "@/lib/posthog/events";
import { isDevModeError } from "@/lib/tauri";
import type { CreateCardInput, KanbanCard, KanbanStatus, LaunchResult, UpdateCardInput } from "@/types/kanban";
import type { AgentPreset } from "@/types/settings";

/** Rewrite a server-local card's id into a GlobalId tagged by its connection. */
function globalize(card: KanbanCard, connId: string): KanbanCard {
  return { ...card, id: toGlobalId(connId, card.id) };
}

/**
 * Aggregated kanban state across every connection. `get_cards` fans out to all
 * servers; each card's id is namespaced into a GlobalId (`connId::entityId`).
 * Mutations split the GlobalId to route back to the owning server with the bare
 * entity id. Adds target the primary connection (or an explicit one). A failing
 * connection drops its cards without taking down the board.
 */
export function useKanban(presets: AgentPreset[] = []) {
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    try {
      const results = await connectionManager.invokeAll<KanbanCard[]>("get_cards");
      const merged: KanbanCard[] = [];
      let realError: string | null = null;
      let anySuccess = false;
      for (const r of results) {
        if (r.data) {
          anySuccess = true;
          for (const card of r.data) merged.push(globalize(card, r.connId));
        } else if (r.error && !isDevModeError(r.error)) {
          realError = String(r.error);
        }
      }
      setCards(merged);
      // Only surface an error when every connection failed — partial failure is
      // a first-class state (the survivors' cards still render).
      setError(anySuccess ? null : realError);
    } catch (e) {
      if (!isDevModeError(e)) {
        console.error("Failed to load cards:", e);
        captureError(e, { where: "useKanban.loadCards" });
        setError(String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
    const off = connectionManager.onTopologyChange(() => void loadCards());
    return off;
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

  const addCard = useCallback(
    async (input: CreateCardInput, targetConnId?: string) => {
      const connId = targetConnId ?? connectionManager.primaryId();
      const card = globalize(await connectionManager.invokeOne<KanbanCard>(connId, "add_card", { input }), connId);
      setCards((prev) => [...prev, card]);
      track("card_created", {
        card_id: card.id,
        agent_preset_id: input.agentPresetId,
        has_prompt: !!input.agentPrompt,
        tags_count: input.tags?.length ?? 0,
        use_worktree: input.useWorktree ?? false,
        ...agentProps(input, presets),
      });
      return card;
    },
    [presets],
  );

  const updateCard = useCallback(
    async (input: UpdateCardInput) => {
      const { connId, entityId } = parseGlobalId(input.id);
      const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "update_card", {
        input: { ...input, id: entityId },
      });
      if (card) upsertCard(globalize(card, connId));
      return card;
    },
    [upsertCard],
  );

  const moveCard = useCallback(
    async (id: string, status: KanbanStatus) => {
      const { connId, entityId } = parseGlobalId(id);
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      try {
        const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "move_card", {
          id: entityId,
          status,
        });
        if (card) upsertCard(globalize(card, connId));
        track("card_moved", { card_id: id, to_status: status });
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
      const { connId, entityId } = parseGlobalId(id);
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, position: newPosition, ...(status ? { status } : {}) } : c)),
      );
      try {
        const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "reorder_card", {
          id: entityId,
          newPosition,
          status: status ?? null,
        });
        if (card) upsertCard(globalize(card, connId));
        return card;
      } catch (e) {
        await loadCards();
        throw e;
      }
    },
    [loadCards, upsertCard],
  );

  const deleteCard = useCallback(async (id: string) => {
    const { connId, entityId } = parseGlobalId(id);
    const success = await connectionManager.invokeOne<boolean>(connId, "delete_card", { id: entityId });
    if (success) setCards((prev) => prev.filter((c) => c.id !== id));
    return success;
  }, []);

  const trashCard = useCallback(
    async (id: string) => {
      const { connId, entityId } = parseGlobalId(id);
      const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "trash_card", { id: entityId });
      if (card) upsertCard(globalize(card, connId));
      return card;
    },
    [upsertCard],
  );

  const restoreCard = useCallback(
    async (id: string, status?: KanbanStatus) => {
      const { connId, entityId } = parseGlobalId(id);
      const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "restore_card", {
        id: entityId,
        status: status ?? null,
      });
      if (card) upsertCard(globalize(card, connId));
      return card;
    },
    [upsertCard],
  );

  const addRevisionNote = useCallback(
    async (id: string, note: string) => {
      const { connId, entityId } = parseGlobalId(id);
      const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "add_revision_note", {
        input: { id: entityId, note },
      });
      if (card) upsertCard(globalize(card, connId));
      return card;
    },
    [upsertCard],
  );

  const answerFeedback = useCallback(
    async (id: string, answer: string) => {
      const { connId, entityId } = parseGlobalId(id);
      const card = await connectionManager.invokeOne<KanbanCard | null>(connId, "answer_feedback", {
        input: { id: entityId, answer },
      });
      if (card) upsertCard(globalize(card, connId));
      return card;
    },
    [upsertCard],
  );

  const launchAgent = useCallback(
    async (cardId: string, workingDir?: string) => {
      const { connId, entityId } = parseGlobalId(cardId);
      try {
        const result = await connectionManager.invokeOne<LaunchResult>(connId, "launch_agent", {
          input: { cardId: entityId, workingDir: workingDir ?? null },
        });
        const now = new Date().toISOString();
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? result.queued
                ? { ...card, agentQueued: true, updatedAt: now }
                : {
                    ...card,
                    status: "in_progress",
                    agentQueued: false,
                    agentRunId: result.runId,
                    agentRunStartedAt: now,
                    agentRunEndedAt: undefined,
                    agentResult: undefined,
                    agentQuestion: undefined,
                    updatedAt: now,
                  }
              : card,
          ),
        );
        const launched = cards.find((c) => c.id === cardId);
        track("agent_launch", {
          card_id: cardId,
          run_id: result.runId,
          queued: result.queued,
          has_working_dir: !!workingDir,
          ...(launched ? agentProps(launched, presets) : {}),
        });
        return result;
      } catch (e) {
        await loadCards();
        throw e;
      }
    },
    [loadCards, cards, presets],
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
