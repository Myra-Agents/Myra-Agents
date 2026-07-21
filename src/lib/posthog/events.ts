import posthog from "posthog-js";

import { PH_ENV } from "./config";

/**
 * Product events. Centralizing the names keeps PostHog's event list clean and
 * lets the type system catch typos at call sites. Add new events here.
 */
export type AppEvent =
  | "card_created"
  | "card_moved"
  | "card_deleted"
  | "card_trashed"
  | "card_restored"
  | "revision_note_added"
  | "feedback_answered"
  | "bulk_action_completed"
  | "agent_launch"
  | "agent_cancel"
  | "agent_run_completed"
  | "agent_run_failed"
  | "schedule_created"
  | "schedule_deleted"
  | "schedule_toggled"
  | "schedule_triggered_manually"
  | "schedule_history_purged"
  | "settings_saved"
  | "integration_connected"
  | "integration_removed"
  | "integration_connect_started"
  | "integration_disconnect_started"
  | "remote_access_enabled"
  | "remote_access_disabled"
  | "ollama_installed"
  | "model_downloaded"
  | "model_removed"
  | "plugin_toggled"
  | "app_update_installed"
  | "onboarding_started"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_step_back"
  | "onboarding_completed"
  | "onboarding_skipped"
  | "onboarding_abandoned"
  | "ollama_install_attempted"
  | "ollama_install_succeeded"
  | "ollama_install_failed";

/**
 * Fire a product event. No-op when PostHog never initialized (no key / SSR),
 * so call sites don't need to guard. `environment` rides along on every event.
 */
export function track(event: AppEvent, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture(event, { environment: PH_ENV, ...properties });
}

/**
 * Report a caught error to PostHog Error Tracking. Use in catch blocks where the
 * error would otherwise be swallowed. Unhandled errors are auto-captured by
 * `capture_exceptions`, so reserve this for handled-but-notable failures.
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  const err = error instanceof Error ? error : new Error(String(error));
  posthog.captureException(err, { environment: PH_ENV, ...context });
}
