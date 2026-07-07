import { useEffect } from "react";

import { create } from "zustand";

/**
 * Lets a route override the trailing breadcrumb crumb in the top bar with a
 * dynamic label/href the path alone can't express — e.g. the schedule editor at
 * `/schedules/edit?id=…` shows "Schedules › Inbox triage" instead of the
 * path-derived "Schedules › Edit". The override replaces the last crumb's label
 * (and optionally its link). Cleared automatically when the owning page unmounts.
 */
export type BreadcrumbOverride = {
  label: string;
  href?: string;
  /**
   * Optional explicit parent crumb. When set, the breadcrumb renders
   * `parent › label` regardless of the current path — e.g. the run detail
   * reached from Operations shows "Operations › {run title}" even though it
   * lives on `/logs`.
   */
  parent?: { label: string; href: string };
  /**
   * Optional intermediate crumb inserted right before the leaf — e.g. the
   * template editor shows "Patrols › Template › {name}". Without an `href`
   * the segment renders as plain (non-clickable) text.
   */
  section?: { label: string; href?: string };
};

type BreadcrumbStore = {
  override: BreadcrumbOverride | null;
  setOverride: (override: BreadcrumbOverride | null) => void;
};

export const useBreadcrumbStore = create<BreadcrumbStore>((set) => ({
  override: null,
  setOverride: (override) => set({ override }),
}));

/** Set the trailing breadcrumb label for the lifetime of the calling component. */
export function useBreadcrumbOverride(override: BreadcrumbOverride | null) {
  const setOverride = useBreadcrumbStore((s) => s.setOverride);
  const label = override?.label;
  const href = override?.href;
  const parentLabel = override?.parent?.label;
  const parentHref = override?.parent?.href;
  const sectionLabel = override?.section?.label;
  const sectionHref = override?.section?.href;
  useEffect(() => {
    setOverride(
      label
        ? {
            label,
            href,
            parent: parentLabel && parentHref ? { label: parentLabel, href: parentHref } : undefined,
            section: sectionLabel ? { label: sectionLabel, href: sectionHref } : undefined,
          }
        : null,
    );
    return () => setOverride(null);
  }, [label, href, parentLabel, parentHref, sectionLabel, sectionHref, setOverride]);
}
