"use client";

import { useEffect, useRef } from "react";

import { usePathname } from "next/navigation";

import { useBoardStore } from "@/stores/board-store";
import { useSchedulesStore } from "@/stores/schedules-store";

/**
 * Silently re-fetches the board + schedules on every route change, so landing on
 * any screen always shows fresh data — on top of the live push events that keep
 * it current while you stay put. The fetch is silent (loadCards/reload never
 * flip the loading flag back on), so there's no spinner flicker on navigation.
 *
 * The first mount is skipped: the stores already load on init
 * ({@link ensureBoardLive} / {@link ensureSchedulesLive}).
 */
export function RefreshOnNavigate() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void pathname; // the route is the trigger — referenced so it stays a dep
    void useBoardStore.getState().loadCards();
    void useSchedulesStore.getState().reload();
  }, [pathname]);
  return null;
}
