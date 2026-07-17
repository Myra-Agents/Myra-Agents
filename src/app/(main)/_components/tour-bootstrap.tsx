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
  const visit = useTourStore((s) => s.visit);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Skip until hydrated, else the first navigation is recorded against the
    // default (disabled) state and dropped.
    if (hydrated) visit(pathname);
  }, [hydrated, pathname, visit]);

  return null;
}
