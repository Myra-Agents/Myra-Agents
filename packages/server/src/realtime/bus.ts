import type { EventName } from "@myra/shared";

/** A single push frame sent over the `/events` channel. */
export interface EventFrame {
  event: EventName;
  payload: unknown;
}

type Subscriber = (frame: EventFrame) => void;

/**
 * In-process pub/sub for backend push events. The agent runner / scheduler
 * (Phase 3c) emit here; the `/events` WebSocket route fans frames out to every
 * connected client. One bus per server instance.
 */
export class EventBus {
  private subscribers = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  emit(event: EventName, payload: unknown): void {
    const frame: EventFrame = { event, payload };
    for (const fn of this.subscribers) {
      try {
        fn(frame);
      } catch {
        // A broken subscriber must not stop the others.
      }
    }
  }
}
