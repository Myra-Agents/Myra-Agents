"use client";

import { useCallback, useEffect, useState } from "react";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";

/** Columns the user can show/hide in the Operations (Runs) list table. The
 *  "task" (operation name) column is the row's anchor and stays pinned. */
export type RunsColumnId = "triggered" | "status" | "duration" | "agent";

export const TOGGLEABLE_COLUMNS: RunsColumnId[] = ["triggered", "status", "duration", "agent"];

const STORAGE_KEY = "myra-agents-runs-columns";

function isColumnId(value: unknown): value is RunsColumnId {
  return typeof value === "string" && (TOGGLEABLE_COLUMNS as string[]).includes(value);
}

function readHidden(): RunsColumnId[] {
  const raw = getLocalStorageValue(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isColumnId) : [];
  } catch {
    return [];
  }
}

/** Persisted column-visibility preferences for the Operations list table. */
export function useRunsColumns() {
  const [hidden, setHidden] = useState<RunsColumnId[]>([]);

  useEffect(() => {
    setHidden(readHidden());
  }, []);

  const persist = useCallback((next: RunsColumnId[]) => {
    setHidden(next);
    setLocalStorageValue(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggleColumn = useCallback((id: RunsColumnId) => {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setLocalStorageValue(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => persist([]), [persist]);

  return { hidden, toggleColumn, resetColumns };
}
