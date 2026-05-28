import { useEffect, useState, useCallback } from "react";
import { listen, type UnlistenFn } from "@/lib/tauri";

interface AgentLogEvent {
  cardId: string;
  runId: string;
  line: string;
}

const MAX_LINES_PER_CARD = 500;

/**
 * Subscribes to the `agent-log-appended` Tauri event.
 * Returns a map { cardId -> recent log lines } plus a reset helper.
 */
export function useAgentLogs() {
  const [logs, setLogs] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    listen<AgentLogEvent>("agent-log-appended", (event) => {
      if (cancelled) return;
      const { cardId, line } = event.payload;
      setLogs((prev) => {
        const next = new Map(prev);
        const existing = next.get(cardId) ?? [];
        const updated = [...existing, line];
        if (updated.length > MAX_LINES_PER_CARD) {
          updated.splice(0, updated.length - MAX_LINES_PER_CARD);
        }
        next.set(cardId, updated);
        return next;
      });
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((e) => console.error("Failed to subscribe agent-log-appended:", e));

    return () => {
      cancelled = true;
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
