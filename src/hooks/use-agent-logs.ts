import { useCallback, useEffect, useState } from "react";

import { toGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import type { UnlistenFn } from "@/lib/tauri";

interface AgentLogEvent {
  cardId: string;
  runId: string;
  line: string;
}

const MAX_LINES_PER_CARD = 500;

/**
 * Subscribes to `agent-log-appended` across every connection. Returns a map
 * { GlobalId -> recent log lines }; the demuxed connId namespaces each server's
 * card id so logs from same-id cards on different servers never collide.
 */
export function useAgentLogs() {
  const [logs, setLogs] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    const subscribe = async () => {
      if (unlisten) {
        unlisten();
        unlisten = undefined;
      }
      try {
        const fn = await connectionManager.listenAll<AgentLogEvent>("agent-log-appended", ({ connId, payload }) => {
          if (cancelled) return;
          const globalId = toGlobalId(connId, payload.cardId);
          setLogs((prev) => {
            const next = new Map(prev);
            const existing = next.get(globalId) ?? [];
            const updated = [...existing, payload.line];
            if (updated.length > MAX_LINES_PER_CARD) {
              updated.splice(0, updated.length - MAX_LINES_PER_CARD);
            }
            next.set(globalId, updated);
            return next;
          });
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch (e) {
        console.error("Failed to subscribe agent-log-appended:", e);
      }
    };

    void subscribe();
    const off = connectionManager.onTopologyChange(() => void subscribe());

    return () => {
      cancelled = true;
      off();
      if (unlisten) unlisten();
    };
  }, []);

  const clearCardLogs = useCallback((cardId: string) => {
    setLogs((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
  }, []);

  return { logs, clearCardLogs };
}
