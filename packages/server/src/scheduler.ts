import {
  computeNextRun,
  EVENTS,
  materializeCardForSchedule,
  nextPositionFor,
  type ScheduleKind,
  type Store,
} from "@myra/shared";
import { Cron } from "croner";

import type { EventBus } from "./realtime/bus";
import type { AgentRunner } from "./runner/agent-runner";
import { isDemoMode } from "./store/file-store";

/** Polling cadence — schedules are checked every tick. */
const TICK_MS = 30_000;
/** Small initial delay so clients can subscribe to events first. */
const INITIAL_DELAY_MS = 2_000;

/**
 * Next fire time for a schedule. Delegates to the shared `computeNextRun` for
 * once/daily/weekly/interval, and uses `croner` for `cron` — the parity gap the
 * shared evaluator leaves open (it returns undefined for cron). Without this,
 * cron schedules would never fire.
 */
function nextRunFor(schedule: ScheduleKind, enabled: boolean, lastTriggeredAt?: string): string | undefined {
  if (!enabled) return undefined;
  if (schedule.type === "cron") {
    try {
      const next = new Cron(schedule.expr).nextRun();
      return next ? next.toISOString() : undefined;
    } catch {
      return undefined;
    }
  }
  return computeNextRun(schedule, enabled, lastTriggeredAt);
}

/**
 * Per-server background scheduler. Every 30s it materializes + launches cards
 * for due schedules and recomputes their `nextRunAt`. Port of `scheduler.rs`.
 */
export class Scheduler {
  private timer?: ReturnType<typeof setInterval>;
  private startTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly store: Store,
    private readonly runner: AgentRunner,
    private readonly bus: EventBus,
  ) {}

  start(): void {
    this.startTimer = setTimeout(() => {
      void this.tick();
      this.timer = setInterval(() => void this.tick(), TICK_MS);
    }, INITIAL_DELAY_MS);
  }

  stop(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      const schedules = await this.store.getSchedules();
      const now = new Date();
      let changed = false;

      for (const task of schedules) {
        if (!task.nextRunAt) {
          task.nextRunAt = nextRunFor(task.schedule, task.enabled, task.lastTriggeredAt);
          changed = true;
        }
        if (!task.enabled) continue;

        const due = task.nextRunAt ? new Date(task.nextRunAt) <= now : false;
        if (!due) continue;

        // Demo mode: advance the cadence but never spawn or create cards.
        if (isDemoMode()) {
          task.lastTriggeredAt = now.toISOString();
          task.nextRunAt = nextRunFor(task.schedule, task.enabled, task.lastTriggeredAt);
          changed = true;
          continue;
        }

        const cards = await this.store.getCards();
        const card = materializeCardForSchedule(task, now.toISOString(), nextPositionFor(cards, "todo"));
        await this.store.saveCards([...cards, card]);

        try {
          await this.runner.launch(card.id);
          const after = await this.store.getCards();
          const updated = after.find((c) => c.id === card.id) ?? card;
          this.bus.emit(EVENTS.agentResultChanged, { card: updated });
        } catch (err) {
          console.error(`[scheduler] failed to launch for schedule ${task.id}:`, err);
        }

        task.lastTriggeredAt = now.toISOString();
        task.nextRunAt = nextRunFor(task.schedule, task.enabled, task.lastTriggeredAt);
        changed = true;
      }

      if (changed) {
        await this.store.saveSchedules(schedules);
        this.bus.emit(EVENTS.schedulesUpdated, null);
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
  }
}
