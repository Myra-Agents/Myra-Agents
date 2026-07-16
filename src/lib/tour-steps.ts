import type { TourStepId } from "@/lib/tour.client";

/**
 * The spotlight walkthroughs, one flow per checklist entry. Clicking a line of
 * the sidebar "Get started" checklist runs the matching flow: the checklist is
 * the menu, the spotlight is the execution.
 *
 * `target` is matched against `data-tour="…"` on a real element. Keep the
 * attribute and the value here in sync — a step whose target never appears is
 * skipped after {@link TARGET_TIMEOUT_MS} rather than wedging the tour.
 */
export interface TourStep {
  /** i18n key under `tour.spotlight.<id>`. */
  id: string;
  /** Route to be on before the step can run. Pushed if we're elsewhere. */
  route?: string;
  /** `data-tour` value of the element to spotlight. */
  target: string;
  /**
   * Advance only when the user really clicks the highlighted element, with no
   * "Next" button. Used where there is one obvious thing to do — it's what
   * makes the tour guided rather than narrated.
   */
  interactive?: boolean;
  /** Extra px around the target rect, for elements whose hitbox is tight. */
  padding?: number;
}

/** How long to wait for a step's target to show up before giving up on it. */
export const TARGET_TIMEOUT_MS = 4000;

export const TOUR_FLOWS: Record<TourStepId, readonly TourStep[]> = {
  explore: [
    { id: "operations", route: "/runs", target: "nav-/runs" },
    { id: "patrols", target: "nav-/schedules" },
    { id: "history", target: "nav-/history" },
  ],
  patrol: [
    // The button is portaled into the shared top bar by the schedules page, so
    // it only exists once we're actually on /schedules.
    { id: "newPatrol", route: "/schedules", target: "new-patrol", interactive: true, padding: 4 },
  ],
  run: [
    // Only rendered when at least one run exists; the step self-skips otherwise.
    { id: "openRun", route: "/history", target: "run-row", interactive: true },
  ],
};
