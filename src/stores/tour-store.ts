import { create } from "zustand";

import { readTour, recordVisit, startTour, stopTour, type TourState, type TourStepId } from "@/lib/tour.client";
import { TOUR_FLOWS } from "@/lib/tour-steps";

/**
 * App-wide guided-tour state. Shared by the sidebar checklist, the Settings
 * replay button and the onboarding wizard's "Show me around" CTA, so any of
 * them can flip the tour on and every surface reacts at once.
 *
 * Two layers, deliberately different in lifetime:
 *  - the checklist (`enabled` + `visited`) is persisted and long-lived;
 *  - the spotlight (`flow` + `index`) is ephemeral and never written to disk —
 *    a walkthrough interrupted by a reload should not resume half-way through
 *    with an overlay the user didn't ask for.
 *
 * Hydrated from localStorage by <TourBootstrap /> after mount — never at module
 * scope, which would run during the static export's prerender where there is no
 * `window`.
 */
type TourStore = TourState & {
  hydrated: boolean;
  /** The spotlight flow currently running, or null when none is. */
  flow: TourStepId | null;
  /** Index of the active step within {@link TOUR_FLOWS}`[flow]`. */
  index: number;
  hydrate: () => void;
  start: () => void;
  stop: () => void;
  visit: (pathname: string) => void;
  startFlow: (flow: TourStepId) => void;
  /**
   * Advance the flow. `fromIndex` guards against a double-advance: on an
   * interactive step the user's click and the target's disappearance (the click
   * navigates away) both fire, and without the guard the second one would skip
   * the following step.
   */
  nextStep: (fromIndex?: number) => void;
  endFlow: () => void;
};

export const useTourStore = create<TourStore>((set, get) => ({
  enabled: false,
  visited: [],
  hydrated: false,
  flow: null,
  index: 0,
  hydrate: () => set({ ...readTour(), hydrated: true }),
  start: () => set({ ...startTour(), flow: null, index: 0 }),
  // Dismissing the checklist must also kill any overlay it launched.
  stop: () => set({ ...stopTour(), flow: null, index: 0 }),
  visit: (pathname) => {
    const next = recordVisit(get(), pathname);
    if (next) set(next);
  },
  startFlow: (flow) => set({ flow, index: 0 }),
  nextStep: (fromIndex) => {
    const { flow, index } = get();
    if (!flow) return;
    if (fromIndex !== undefined && fromIndex !== index) return;
    // Past the last step the flow is simply over — the checklist ticks itself
    // from real state, so there is nothing to mark as done here.
    if (index + 1 >= TOUR_FLOWS[flow].length) set({ flow: null, index: 0 });
    else set({ index: index + 1 });
  },
  endFlow: () => set({ flow: null, index: 0 }),
}));
