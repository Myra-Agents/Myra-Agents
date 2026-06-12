import { useEffect } from "react";

import { toGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { track } from "@/lib/posthog/events";
import type { UnlistenFn } from "@/lib/tauri";
import type { KanbanCard } from "@/types/kanban";

interface AgentResultEvent {
  card: KanbanCard;
}

/**
 * Subscribes to `agent-result-changed` across every connection. When an agent
 * finishes (or asks for feedback) on any server, that server emits the updated
 * card; the demuxed connId namespaces the card's id into its GlobalId before it
 * upserts into the aggregated board. Re-subscribes when connections change.
 */
export function useAgentEvents(onCardUpdated: (card: KanbanCard) => void) {
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    const subscribe = async () => {
      if (unlisten) {
        unlisten();
        unlisten = undefined;
      }
      try {
        const fn = await connectionManager.listenAll<AgentResultEvent>(
          "agent-result-changed",
          ({ connId, payload }) => {
            if (cancelled) return;
            const card = payload.card;
            // `failed` runs are parked back in the Todo column by applyResult.
            const failed = card.status === "todo";
            const duration_ms =
              card.agentRunEndedAt && card.agentRunStartedAt
                ? Date.parse(card.agentRunEndedAt) - Date.parse(card.agentRunStartedAt)
                : undefined;
            track(failed ? "agent_run_failed" : "agent_run_completed", {
              card_id: toGlobalId(connId, card.id),
              final_status: card.status,
              has_question: !!card.agentQuestion,
              duration_ms,
            });
            onCardUpdated({ ...card, id: toGlobalId(connId, card.id) });
          },
        );
        if (cancelled) fn();
        else unlisten = fn;
      } catch (e) {
        console.error("Failed to subscribe to agent-result-changed:", e);
      }
    };

    void subscribe();
    const off = connectionManager.onTopologyChange(() => void subscribe());

    return () => {
      cancelled = true;
      off();
      if (unlisten) unlisten();
    };
  }, [onCardUpdated]);
}
