import type { TourStepId } from "@/lib/tour.client";

/**
 * The spotlight walkthroughs, one flow per checklist entry. Clicking a line of
 * the "Get started" card runs the matching flow: the card is the menu, the
 * spotlight is the execution.
 *
 * `target` is matched against `data-tour="…"` on a real element. Keep the
 * attribute and the value here in sync — a step whose target never appears is
 * skipped after {@link TARGET_TIMEOUT_MS} rather than wedging the tour.
 *
 * Flows are written to *end where the checklist entry ticks*: each entry is
 * satisfied by real state, so a walkthrough that stops short leaves its own box
 * unticked. Hence explore visits all three views rather than merely pointing at
 * them, patrol runs through to Save, and run goes all the way to opening a run.
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
  // Each step opens its view rather than just ringing the link — otherwise the
  // walkthrough claims to show the views without ever showing them, and the
  // checklist entry (which needs all three visited) never ticks.
  explore: [
    { id: "operations", route: "/runs", target: "nav-/runs" },
    { id: "patrols", route: "/schedules", target: "nav-/schedules" },
    { id: "history", route: "/history", target: "nav-/history" },
  ],
  // Through to a saved patrol: the "New patrol" click only opens the editor, and
  // stopping there leaves nothing on the board and the box unticked.
  patrol: [
    // Portaled into the shared top bar by the schedules page, so it only exists
    // once we're actually on /schedules.
    { id: "newPatrol", route: "/schedules", target: "new-patrol", interactive: true, padding: 4 },
    // The click above lands on the editor; no route of our own to push.
    { id: "savePatrol", target: "save-patrol", interactive: true, padding: 4 },
  ],
  // Launch one by hand, then read it. Both steps self-skip when there's no
  // patrol to run, which is the state a user who skipped `patrol` is in.
  run: [
    { id: "rowMenu", route: "/schedules", target: "patrol-row-menu", interactive: true, padding: 2 },
    { id: "runNow", target: "run-now", interactive: true },
    { id: "openRun", route: "/history", target: "run-row", interactive: true },
  ],
};
