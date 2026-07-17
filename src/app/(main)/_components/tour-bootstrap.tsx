"use client";

import { useEffect } from "react";

import { usePathname } from "next/navigation";

import { useTourStore } from "@/stores/tour-store";

/**
 * Hydrates the guided-tour state from localStorage after mount, then ticks the
 * checklist as the user navigates. Renders nothing.
 *
 * Mounted once in the (main) layout so route visits are recorded no matter how
 * the user got there — sidebar click, breadcrumb, deep link or ⌘K.
 */
export function TourBootstrap() {
  const pathname = usePathname();
  const hydrate = useTourStore((s) => s.hydrate);
  const hydrated = useTourStore((s) => s.hydrated);
  const enabled = useTourStore((s) => s.enabled);
  const visit = useTourStore((s) => s.visit);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Skip until hydrated, else the first navigation is recorded against the
    // default (disabled) state and dropped.
    //
    // `enabled` is a dependency because turning the tour on has to count the
    // page it was turned on from. Without it, someone who opts in while sitting
    // on Operations never gets Operations recorded — the pathname never changes,
    // so nothing re-runs — and the explore box can't tick.
    if (hydrated && enabled) visit(pathname);
  }, [hydrated, enabled, pathname, visit]);

  return null;
}
