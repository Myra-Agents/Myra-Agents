import posthog from "posthog-js";

import { PH_ENV } from "./config";

/**
 * Product events. Centralizing the names keeps PostHog's event list clean and
 * lets the type system catch typos at call sites. Add new events here.
 */
export type AppEvent =
  | "card_created"
  | "card_moved"
  | "agent_launch"
  | "agent_run_completed"
  | "agent_run_failed"
  | "schedule_created"
  | "settings_saved";

/**
 * Fire a product event. No-op when PostHog never initialized (no key / SSR),
 * so call sites don't need to guard. `environment` rides along on every event.
 */
export function track(event: AppEvent, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture(event, { environment: PH_ENV, ...properties });
}
