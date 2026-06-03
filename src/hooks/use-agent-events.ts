import { useEffect } from "react";

import { toGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
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
            onCardUpdated({ ...payload.card, id: toGlobalId(connId, payload.card.id) });
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
