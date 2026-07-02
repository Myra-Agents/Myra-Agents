"use client";

import { useCallback, useEffect, useState } from "react";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";

/**
 * Factory that creates a column-visibility hook for a given table. Both the
 * Runs list and the History table need the same persist/toggle/reset logic —
 * only the column IDs and the storage key differ.
 */
export function makeColumnVisibilityHook<T extends string>(storageKey: string, validIds: readonly T[]) {
  function isValidId(v: unknown): v is T {
    return typeof v === "string" && (validIds as readonly string[]).includes(v);
  }

  function readHidden(): T[] {
    const raw = getLocalStorageValue(storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidId) : [];
    } catch {
      return [];
    }
  }

  return function useColumnVisibility() {
    const [hidden, setHidden] = useState<T[]>([]);

    useEffect(() => {
      setHidden(readHidden());
    }, []);

    const persist = useCallback((next: T[]) => {
      setHidden(next);
      setLocalStorageValue(storageKey, JSON.stringify(next));
    }, []);

    const toggleColumn = useCallback((id: T) => {
      setHidden((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        setLocalStorageValue(storageKey, JSON.stringify(next));
        return next;
      });
    }, []);

    const resetColumns = useCallback(() => persist([]), [persist]);

    return { hidden, toggleColumn, resetColumns };
  };
}
