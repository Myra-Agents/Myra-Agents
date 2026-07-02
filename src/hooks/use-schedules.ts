import { useCallback, useEffect } from "react";

import { ensureSchedulesLive, useSchedulesStore } from "@/stores/schedules-store";
import { isToday } from "@/types/schedule";

/**
 * Thin selector over the global {@link useSchedulesStore}. Schedules are now a
 * single app-wide store fed by each server's `schedules-updated` event and
 * connection topology, so every screen auto-reflects scheduler-loop changes in
 * real time with no polling. The returned API is unchanged.
 */
export function useSchedules() {
  const schedules = useSchedulesStore((s) => s.schedules);
  const loading = useSchedulesStore((s) => s.loading);
  const error = useSchedulesStore((s) => s.error);

  const reload = useSchedulesStore((s) => s.reload);
  const createSchedule = useSchedulesStore((s) => s.createSchedule);
  const updateSchedule = useSchedulesStore((s) => s.updateSchedule);
  const deleteSchedule = useSchedulesStore((s) => s.deleteSchedule);
  const toggleEnabled = useSchedulesStore((s) => s.toggleEnabled);
  const triggerNow = useSchedulesStore((s) => s.triggerNow);
  const purgeHistory = useSchedulesStore((s) => s.purgeHistory);

  // Start the global data load + live subscription once (idempotent).
  useEffect(() => {
    ensureSchedulesLive();
  }, []);

  const byId = useCallback(
    (id: string | undefined) => {
      if (!id) return undefined;
      return schedules.find((s) => s.id === id);
    },
    [schedules],
  );

  const todayTriggers = useCallback(() => {
    const now = new Date();
    return schedules
      .filter((s) => s.enabled && isToday(s.nextRunAt, now))
      .filter((s) => {
        const next = s.nextRunAt ? new Date(s.nextRunAt) : null;
        return next !== null && next >= now;
      })
      .sort((a, b) => {
        const ta = a.nextRunAt ? Date.parse(a.nextRunAt) : 0;
        const tb = b.nextRunAt ? Date.parse(b.nextRunAt) : 0;
        return ta - tb;
      });
  }, [schedules]);

  return {
    schedules,
    loading,
    error,
    reload,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    toggleEnabled,
    triggerNow,
    purgeHistory,
    byId,
    todayTriggers,
  };
}
