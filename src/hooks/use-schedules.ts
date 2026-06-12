import { useCallback, useEffect, useState } from "react";

import { parseGlobalId, toGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { track } from "@/lib/posthog/events";
import { isDevModeError, type UnlistenFn } from "@/lib/tauri";
import type { CreateScheduleInput, ScheduledTask, UpdateScheduleInput } from "@/types/schedule";
import { isToday } from "@/types/schedule";

/** Namespace a server-local schedule's id by its connection. */
function globalize(task: ScheduledTask, connId: string): ScheduledTask {
  return { ...task, id: toGlobalId(connId, task.id) };
}

/**
 * Aggregated schedule state across every connection. `list_schedules` fans out;
 * each task's id is namespaced into a GlobalId so mutations route back to the
 * owning server. Subscribes to each server's `schedules-updated` event (demuxed)
 * to reflect scheduler-loop changes immediately.
 */
export function useSchedules() {
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const results = await connectionManager.invokeAll<ScheduledTask[]>("list_schedules");
      const merged: ScheduledTask[] = [];
      let realError: string | null = null;
      let anySuccess = false;
      for (const r of results) {
        if (r.data) {
          anySuccess = true;
          for (const task of r.data) merged.push(globalize(task, r.connId));
        } else if (r.error && !isDevModeError(r.error)) {
          realError = String(r.error);
        }
      }
      setSchedules(merged);
      setError(anySuccess ? null : realError);
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
    void reload();
    const off = connectionManager.onTopologyChange(() => void reload());
    return off;
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;
    const subscribe = async () => {
      if (unlisten) {
        unlisten();
        unlisten = undefined;
      }
      try {
        const fn = await connectionManager.listenAll("schedules-updated", () => {
          if (!cancelled) void reload();
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch (e) {
        console.error("Failed to subscribe schedules-updated:", e);
      }
    };
    void subscribe();
    // Re-subscribe when the set of connections changes.
    const off = connectionManager.onTopologyChange(() => void subscribe());
    return () => {
      cancelled = true;
      off();
      if (unlisten) unlisten();
    };
  }, [reload]);

  const createSchedule = useCallback(async (input: CreateScheduleInput, targetConnId?: string) => {
    const connId = targetConnId ?? connectionManager.primaryId();
    const task = globalize(
      await connectionManager.invokeOne<ScheduledTask>(connId, "create_schedule", { input }),
      connId,
    );
    setSchedules((prev) => [...prev, task]);
    track("schedule_created", {
      schedule_id: task.id,
      schedule_type: input.schedule?.type,
      enabled: input.enabled,
      agent_preset_id: input.agentPresetId,
      has_prompt: !!input.agentPrompt,
    });
    return task;
  }, []);

  const updateSchedule = useCallback(async (input: UpdateScheduleInput) => {
    const { connId, entityId } = parseGlobalId(input.id);
    const task = globalize(
      await connectionManager.invokeOne<ScheduledTask>(connId, "update_schedule", {
        input: { ...input, id: entityId },
      }),
      connId,
    );
    setSchedules((prev) => prev.map((s) => (s.id === task.id ? task : s)));
    return task;
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    const { connId, entityId } = parseGlobalId(id);
    const ok = await connectionManager.invokeOne<boolean>(connId, "delete_schedule", { id: entityId });
    if (ok) setSchedules((prev) => prev.filter((s) => s.id !== id));
    return ok;
  }, []);

  const toggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    const { connId, entityId } = parseGlobalId(id);
    const task = await connectionManager.invokeOne<ScheduledTask | null>(connId, "toggle_schedule_enabled", {
      id: entityId,
      enabled,
    });
    if (task) {
      const g = globalize(task, connId);
      setSchedules((prev) => prev.map((s) => (s.id === g.id ? g : s)));
      return g;
    }
    return task;
  }, []);

  const triggerNow = useCallback(async (id: string) => {
    const { connId, entityId } = parseGlobalId(id);
    return connectionManager.invokeOne<string>(connId, "trigger_schedule_now", { id: entityId });
  }, []);

  const purgeHistory = useCallback(async (id: string) => {
    const { connId, entityId } = parseGlobalId(id);
    return connectionManager.invokeOne<number>(connId, "purge_schedule_history", { id: entityId });
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
