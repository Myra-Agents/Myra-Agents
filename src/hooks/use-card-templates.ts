"use client";

import { useCallback, useEffect, useState } from "react";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import type { CardTemplate } from "@/types/kanban";

const STORAGE_KEY = "myra-agents-card-templates";

type TemplateInput = Omit<CardTemplate, "id" | "createdAt">;

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readTemplates(): CardTemplate[] {
  const raw = getLocalStorageValue(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CardTemplate => {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.description === "string" &&
        typeof item.agentPrompt === "string" &&
        Array.isArray(item.tags)
      );
    });
  } catch {
    return [];
  }
}

export function useCardTemplates() {
  const [templates, setTemplates] = useState<CardTemplate[]>([]);

  useEffect(() => {
    setTemplates(readTemplates());
  }, []);

  const persist = useCallback((next: CardTemplate[]) => {
    setTemplates(next);
    setLocalStorageValue(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const saveTemplate = useCallback(
    (input: TemplateInput) => {
      const template: CardTemplate = {
        ...input,
        id: createId(),
        createdAt: new Date().toISOString(),
      };
      persist([...templates, template].sort((a, b) => a.name.localeCompare(b.name)));
      return template;
    },
    [persist, templates],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      persist(templates.filter((template) => template.id !== id));
    },
    [persist, templates],
  );

  return { templates, saveTemplate, deleteTemplate };
}
