"use client";

import { useCallback, useEffect, useState } from "react";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { COLUMN_STATUSES, type KanbanStatus } from "@/types/kanban";

const STORAGE_KEY = "myra-agents-column-preferences";

export type ColumnPreferences = {
  hiddenStatuses: KanbanStatus[];
  labels: Partial<Record<KanbanStatus, string>>;
};

const DEFAULT_PREFERENCES: ColumnPreferences = {
  hiddenStatuses: [],
  labels: {},
};

function isKanbanStatus(value: unknown): value is KanbanStatus {
  return typeof value === "string" && (COLUMN_STATUSES as readonly string[]).includes(value);
}

function readPreferences(): ColumnPreferences {
  const raw = getLocalStorageValue(STORAGE_KEY);
  if (!raw) return DEFAULT_PREFERENCES;

  try {
    const parsed = JSON.parse(raw);
    const hiddenStatuses = Array.isArray(parsed?.hiddenStatuses) ? parsed.hiddenStatuses.filter(isKanbanStatus) : [];
    const labels: Partial<Record<KanbanStatus, string>> = {};
    if (parsed?.labels && typeof parsed.labels === "object") {
      for (const status of COLUMN_STATUSES) {
        const label = parsed.labels[status];
        if (typeof label === "string" && label.trim()) labels[status] = label;
      }
    }
    return { hiddenStatuses, labels };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function useColumnPreferences() {
  const [preferences, setPreferences] = useState<ColumnPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPreferences(readPreferences());
  }, []);

  const persist = useCallback((next: ColumnPreferences) => {
    setPreferences(next);
    setLocalStorageValue(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setColumnHidden = useCallback(
    (status: KanbanStatus, hidden: boolean) => {
      const nextHidden = hidden
        ? [...new Set([...preferences.hiddenStatuses, status])]
        : preferences.hiddenStatuses.filter((item) => item !== status);
      persist({ ...preferences, hiddenStatuses: nextHidden });
    },
    [persist, preferences],
  );

  const setColumnLabel = useCallback(
    (status: KanbanStatus, label: string) => {
      const labels = { ...preferences.labels };
      const trimmed = label.trim();
      if (trimmed) {
        labels[status] = trimmed;
      } else {
        delete labels[status];
      }
      persist({ ...preferences, labels });
    },
    [persist, preferences],
  );

  const resetColumnPreferences = useCallback(() => {
    persist(DEFAULT_PREFERENCES);
  }, [persist]);

  return {
    preferences,
    setColumnHidden,
    setColumnLabel,
    resetColumnPreferences,
  };
}
