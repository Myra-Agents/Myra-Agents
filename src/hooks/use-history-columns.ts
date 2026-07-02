"use client";

import { useCallback, useEffect, useState } from "react";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";

/** Columns the user can show/hide in the History / Operations & History table.
 *  The "task" (operation name) column is the row's anchor and stays pinned. */
export type HistoryColumnId = "triggered" | "ended" | "duration" | "agent" | "result" | "usage";

export const TOGGLEABLE_COLUMNS: HistoryColumnId[] = ["triggered", "ended", "duration", "agent", "result", "usage"];

const STORAGE_KEY = "myra-agents-history-columns";

function isColumnId(value: unknown): value is HistoryColumnId {
  return typeof value === "string" && (TOGGLEABLE_COLUMNS as string[]).includes(value);
}

function readHidden(): HistoryColumnId[] {
  const raw = getLocalStorageValue(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isColumnId) : [];
  } catch {
    return [];
  }
}

/** Persisted column-visibility preferences for the runs table. Shared across the
 *  standalone History page and the Patrol editor's Operations & History tab. */
export function useHistoryColumns() {
  const [hidden, setHidden] = useState<HistoryColumnId[]>([]);

  useEffect(() => {
    setHidden(readHidden());
  }, []);

  const persist = useCallback((next: HistoryColumnId[]) => {
    setHidden(next);
    setLocalStorageValue(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggleColumn = useCallback((id: HistoryColumnId) => {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setLocalStorageValue(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => persist([]), [persist]);

  return { hidden, toggleColumn, resetColumns };
}
