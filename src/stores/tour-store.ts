import { create } from "zustand";

import { readTour, recordVisit, startTour, stopTour, type TourState } from "@/lib/tour.client";

/**
 * App-wide guided-tour state. Shared by the sidebar checklist, the Settings
 * replay button and the onboarding wizard's "Show me around" CTA, so any of
 * them can flip the tour on and every surface reacts at once.
 *
 * Hydrated from localStorage by <TourBootstrap /> after mount — never at module
 * scope, which would run during the static export's prerender where there is no
 * `window`.
 */
type TourStore = TourState & {
  hydrated: boolean;
  hydrate: () => void;
  start: () => void;
  stop: () => void;
  visit: (pathname: string) => void;
};

export const useTourStore = create<TourStore>((set, get) => ({
  enabled: false,
  visited: [],
  hydrated: false,
  hydrate: () => set({ ...readTour(), hydrated: true }),
  start: () => set(startTour()),
  stop: () => set(stopTour()),
  visit: (pathname) => {
    const next = recordVisit(get(), pathname);
    if (next) set(next);
  },
}));
