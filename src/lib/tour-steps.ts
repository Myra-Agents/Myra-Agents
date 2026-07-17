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
   * Advance only when the user really presses the highlighted element, with no
   * "Next" button. Used where there is one obvious thing to do — it's what
   * makes the tour guided rather than narrated.
   */
  interactive?: boolean;
  /**
   * Like {@link interactive}, but advance only once the target has left the
   * DOM rather than on the press. For a button whose action can fail — Save
   * rejects an incomplete patrol — the press proves nothing: advancing on it
   * marches the user forward while an error toast says they didn't get
   * anywhere. The target disappearing is the outcome we actually mean.
   */
  awaitVanish?: boolean;
  /** Extra px around the target rect, for elements whose hitbox is tight. */
  padding?: number;
  /**
   * Dim everything but the target. On by default.
   *
   * Off for steps whose whole point is the page behind: dimming the content to
   * spotlight a nav link means the user clicks it, the view changes, and they
   * can't see a thing — the ring alone carries them.
   */
  dim?: boolean;
  /**
   * Hold "Next" back until the target carries `data-tour-satisfied="true"`.
   *
   * For a step the user must actually complete rather than merely read: the
   * folder is required to save, so offering Next beside an empty picker invites
   * them to walk past it and hit the error at the end. The screen that owns the
   * state sets the attribute — the tour can't tell a chosen folder from an
   * unchosen one by looking at the DOM. Skip still gets out.
   */
  requireSatisfied?: boolean;
}

/** How long to wait for a step's target to show up before giving up on it. */
export const TARGET_TIMEOUT_MS = 4000;

/**
 * Dispatched on a step's target when the user takes up its suggestion and the
 * tour can't apply it by writing to a field — a trigger is React state, not a
 * DOM value. The screen that owns the state listens and applies its own shape,
 * rather than the tour reaching in and guessing at it.
 */
export const TOUR_APPLY_EVENT = "myra:tour-apply";

export const TOUR_FLOWS: Record<TourStepId, readonly TourStep[]> = {
  // The user opens each view themselves, by clicking the ringed nav link. No
  // `route` of our own: navigating for them and then asking for a Next is a
  // slideshow, and the point is that they come away knowing where these live.
  // Their click is also what records the visit the checklist entry needs.
  //
  // Undimmed: these steps are *about* the page that appears. Blacking it out to
  // spotlight the link would hide the only thing worth looking at.
  explore: [
    { id: "operations", target: "nav-/runs", interactive: true, padding: 2, dim: false },
    { id: "patrols", target: "nav-/schedules", interactive: true, padding: 2, dim: false },
    { id: "history", target: "nav-/history", interactive: true, padding: 2, dim: false },
  ],
  // Through to a saved patrol, field by field: opening the editor and pointing
  // at Save taught nothing — an empty patrol can't even be saved (the trigger
  // and the instruction are required), so the box would never tick.
  //
  // Only the two ends are interactive. The middle steps ask the user to *type*,
  // and there's no press to wait for — a "Next" they control is the honest
  // affordance, and it lets them skip a field they don't want.
  patrol: [
    // Portaled into the shared top bar by the schedules page, so it only exists
    // once we're actually on /schedules.
    { id: "newPatrol", route: "/schedules", target: "new-patrol", interactive: true, padding: 4 },
    // The click above lands on the editor; no route of our own to push.
    { id: "patrolName", target: "patrol-name", padding: 2 },
    { id: "patrolSubtitle", target: "patrol-subtitle", padding: 2 },
    { id: "patrolTag", target: "patrol-tag", padding: 4 },
    // Save refuses a patrol with no working folder, and a blank draft has none —
    // leaving this out would walk the user into a Save that just errors, so the
    // step holds Next until one is really picked.
    { id: "patrolFolder", target: "patrol-folder", padding: 2, requireSatisfied: true },
    { id: "patrolTrigger", target: "patrol-trigger", padding: 4 },
    { id: "patrolInstruction", target: "patrol-instruction", padding: 8 },
    { id: "patrolAgent", target: "patrol-agent", padding: 4 },
    // Not `interactive`: Save refuses an incomplete patrol, and advancing on the
    // press would push the user to the next step — which navigates — while the
    // toast tells them it didn't save. Waiting for the button to leave the DOM
    // waits for the editor to actually close.
    { id: "savePatrol", target: "save-patrol", awaitVanish: true, padding: 4 },
    // Add lands back on /schedules; close by showing that the next one needn't
    // be built from a blank page at all.
    { id: "patrolTemplates", route: "/schedules", target: "patrol-templates", padding: 8 },
  ],
  // Launch one by hand, then read it. Both steps self-skip when there's no
  // patrol to run, which is the state a user who skipped `patrol` is in.
  run: [
    { id: "rowMenu", route: "/schedules", target: "patrol-row-menu", interactive: true, padding: 2 },
    { id: "runNow", target: "run-now", interactive: true },
    { id: "openRun", route: "/history", target: "run-row", interactive: true },
  ],
};
