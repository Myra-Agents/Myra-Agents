"use client";

import { useCallback, useEffect, useState } from "react";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { createSkillId, type MarketplaceSkill, type Skill, type SkillInput, skillFromMarketplace } from "@/types/skill";

const STORAGE_KEY = "myra-agents-skills";

// Cross-instance sync: mutating the store dispatches this event so every mounted
// `useSkills()` re-reads localStorage (multiple pages/components share one list).
const SYNC_EVENT = "myra:skills-changed";

function isSkill(value: unknown): value is Skill {
  const s = value as Skill;
  return (
    !!s &&
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.description === "string" &&
    typeof s.content === "string" &&
    (s.source === "custom" || s.source === "marketplace")
  );
}

function readSkills(): Skill[] {
  const raw = getLocalStorageValue(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSkill) : [];
  } catch {
    return [];
  }
}

function sortSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Client-side skill library. Persisted to localStorage (skills are not mirrored
 * by the sidecar — see `@/types/skill`). CRUD plus marketplace install/uninstall.
 */
export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    const reload = () => setSkills(readSkills());
    reload();
    // Same-tab mutations fire a custom event; other tabs fire `storage`.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) reload();
    };
    window.addEventListener(SYNC_EVENT, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const persist = useCallback((next: Skill[]) => {
    const sorted = sortSkills(next);
    setSkills(sorted);
    setLocalStorageValue(STORAGE_KEY, JSON.stringify(sorted));
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const addSkill = useCallback(
    (input: SkillInput): Skill => {
      const now = new Date().toISOString();
      const skill: Skill = {
        ...input,
        id: createSkillId(),
        source: "custom",
        createdAt: now,
        updatedAt: now,
      };
      persist([...readSkills(), skill]);
      return skill;
    },
    [persist],
  );

  const updateSkill = useCallback(
    (id: string, patch: Partial<SkillInput>) => {
      const now = new Date().toISOString();
      persist(readSkills().map((s) => (s.id === id ? { ...s, ...patch, updatedAt: now } : s)));
    },
    [persist],
  );

  const deleteSkill = useCallback(
    (id: string) => {
      persist(readSkills().filter((s) => s.id !== id));
    },
    [persist],
  );

  const installFromMarketplace = useCallback(
    (entry: MarketplaceSkill): Skill => {
      const skill = skillFromMarketplace(entry);
      persist([...readSkills(), skill]);
      return skill;
    },
    [persist],
  );

  /** True when a marketplace entry has already been installed into the library. */
  const isInstalled = useCallback(
    (marketplaceId: string) => skills.some((s) => s.marketplaceId === marketplaceId),
    [skills],
  );

  return { skills, addSkill, updateSkill, deleteSkill, installFromMarketplace, isInstalled };
}
