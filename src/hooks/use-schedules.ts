import { useCallback, useEffect, useState } from "react";
import { invoke, listen, isDevModeError, type UnlistenFn } from "@/lib/tauri";
import type {
  CreateScheduleInput,
  ScheduledTask,
  UpdateScheduleInput,
} from "@/types/schedule";
import { isToday } from "@/types/schedule";

/**
 * Frontend state mirror of the Rust schedule store. Auto-subscribes to the
 * `schedules-updated` Tauri event so changes from the scheduler loop are
 * reflected immediately.
 */
export function useSchedules() {
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const data = await invoke<ScheduledTask[]>("list_schedules");
      setSchedules(data);
    } catch (e) {
      if (!isDevModeError(e)) {
        console.error("Failed to load schedules:", e);
        setError(String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    listen("schedules-updated", () => {
      if (!cancelled) reload();
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((e) => console.error("Failed to subscribe schedules-updated:", e));
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [reload]);

  const createSchedule = useCallback(async (input: CreateScheduleInput) => {
    const task = await invoke<ScheduledTask>("create_schedule", { input });
    setSchedules((prev) => [...prev, task]);
    return task;
  }, []);

  const updateSchedule = useCallback(async (input: UpdateScheduleInput) => {
    const task = await invoke<ScheduledTask>("update_schedule", { input });
    setSchedules((prev) => prev.map((s) => (s.id === task.id ? task : s)));
    return task;
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    const ok = await invoke<boolean>("delete_schedule", { id });
    if (ok) setSchedules((prev) => prev.filter((s) => s.id !== id));
    return ok;
  }, []);

  const toggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    const task = await invoke<ScheduledTask | null>("toggle_schedule_enabled", {
      id,
      enabled,
    });
    if (task) setSchedules((prev) => prev.map((s) => (s.id === task.id ? task : s)));
    return task;
  }, []);

  const triggerNow = useCallback(async (id: string) => {
    return invoke<string>("trigger_schedule_now", { id });
  }, []);

  const purgeHistory = useCallback(async (id: string) => {
    return invoke<number>("purge_schedule_history", { id });
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
