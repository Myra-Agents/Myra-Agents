import { useEffect } from "react";
import { listen, type UnlistenFn } from "@/lib/tauri";
import type { KanbanCard } from "@/types/kanban";

interface AgentResultEvent {
  card: KanbanCard;
}

/**
 * Subscribes to the `agent-result-changed` Tauri event emitted by the Rust
 * filesystem watcher. When an agent finishes (or asks for feedback), the
 * backend writes the updated card to disk and emits this event.
 */
export function useAgentEvents(onCardUpdated: (card: KanbanCard) => void) {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    listen<AgentResultEvent>("agent-result-changed", (event) => {
      if (cancelled) return;
      onCardUpdated(event.payload.card);
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => {
        console.error("Failed to subscribe to agent-result-changed:", e);
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [onCardUpdated]);
}
