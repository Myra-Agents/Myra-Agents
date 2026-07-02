import { create } from "zustand";

import { parseGlobalId, toGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { track } from "@/lib/posthog/events";
import { isDevModeError } from "@/lib/tauri";
import type { CreateScheduleInput, ScheduledTask, UpdateScheduleInput } from "@/types/schedule";

/**
 * Global schedules store — single source of truth for the aggregated schedule
 * list across every connection. Self-initializes once ({@link ensureSchedulesLive})
 * and subscribes to each server's `schedules-updated` event so scheduler-loop
 * changes reflect everywhere immediately, no polling. Replaces the old
 * per-component `useSchedules` local state.
 */

/** Namespace a server-local schedule's id by its connection. */
function globalize(task: ScheduledTask, connId: string): ScheduledTask {
  return { ...task, id: toGlobalId(connId, task.id) };
}

interface SchedulesState {
  schedules: ScheduledTask[];
  loading: boolean;
  error: string | null;
  live: boolean;

  reload: () => Promise<void>;
  createSchedule: (input: CreateScheduleInput, targetConnId?: string) => Promise<ScheduledTask>;
  updateSchedule: (input: UpdateScheduleInput) => Promise<ScheduledTask>;
  deleteSchedule: (id: string) => Promise<boolean>;
  toggleEnabled: (id: string, enabled: boolean) => Promise<ScheduledTask | null>;
  triggerNow: (id: string) => Promise<string>;
  purgeHistory: (id: string) => Promise<number>;
}

export const useSchedulesStore = create<SchedulesState>((set, get) => ({
  schedules: [],
  loading: true,
  error: null,
  live: false,

  reload: async () => {
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
      set({ schedules: merged, error: anySuccess ? null : realError });
    } catch (e) {
      if (!isDevModeError(e)) {
        console.error("Failed to load schedules:", e);
        set({ error: String(e) });
      }
    } finally {
      set({ loading: false });
    }
  },

  createSchedule: async (input, targetConnId) => {
    const connId = targetConnId ?? connectionManager.primaryId();
    const task = globalize(
      await connectionManager.invokeOne<ScheduledTask>(connId, "create_schedule", { input }),
      connId,
    );
    set({ schedules: [...get().schedules, task] });
    track("schedule_created", {
      schedule_id: task.id,
      schedule_type: input.schedule?.type,
      enabled: input.enabled,
      agent_preset_id: input.agentPresetId,
      has_prompt: !!input.agentPrompt,
    });
    return task;
  },

  updateSchedule: async (input) => {
    const { connId, entityId } = parseGlobalId(input.id);
    const task = globalize(
      await connectionManager.invokeOne<ScheduledTask>(connId, "update_schedule", {
        input: { ...input, id: entityId },
      }),
      connId,
    );
    set({ schedules: get().schedules.map((s) => (s.id === task.id ? task : s)) });
    return task;
  },

  deleteSchedule: async (id) => {
    const { connId, entityId } = parseGlobalId(id);
    const ok = await connectionManager.invokeOne<boolean>(connId, "delete_schedule", { id: entityId });
    if (ok) set({ schedules: get().schedules.filter((s) => s.id !== id) });
    return ok;
  },

  toggleEnabled: async (id, enabled) => {
    const { connId, entityId } = parseGlobalId(id);
    const task = await connectionManager.invokeOne<ScheduledTask | null>(connId, "toggle_schedule_enabled", {
      id: entityId,
      enabled,
    });
    if (task) {
      const g = globalize(task, connId);
      set({ schedules: get().schedules.map((s) => (s.id === g.id ? g : s)) });
      return g;
    }
    return task;
  },

  triggerNow: async (id) => {
    const { connId, entityId } = parseGlobalId(id);
    return connectionManager.invokeOne<string>(connId, "trigger_schedule_now", { id: entityId });
  },

  purgeHistory: async (id) => {
    const { connId, entityId } = parseGlobalId(id);
    return connectionManager.invokeOne<number>(connId, "purge_schedule_history", { id: entityId });
  },
}));

// ── Live wiring (subscribed once for the whole app) ──────────────────────────

let liveUnsubs: Array<() => void> = [];
let subscribeChain: Promise<void> = Promise.resolve();

async function doSubscribeLive() {
  for (const off of liveUnsubs) off();
  liveUnsubs = [];
  try {
    const fn = await connectionManager.listenAll("schedules-updated", () => {
      void useSchedulesStore.getState().reload();
    });
    liveUnsubs.push(fn);
  } catch (e) {
    console.error("Failed to subscribe schedules-updated:", e);
  }
}

function subscribeLive(): void {
  subscribeChain = subscribeChain.then(doSubscribeLive);
}

/** Start the schedules data load + live subscription exactly once. Idempotent. */
export function ensureSchedulesLive() {
  if (useSchedulesStore.getState().live) return;
  useSchedulesStore.setState({ live: true });
  void useSchedulesStore.getState().reload();
  void subscribeLive();
  connectionManager.onTopologyChange(() => {
    void useSchedulesStore.getState().reload();
    void subscribeLive();
  });
}
