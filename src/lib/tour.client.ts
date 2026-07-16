/**
 * Guided-tour state — a "Get started" checklist shown in the sidebar.
 *
 * Stored app-locally next to {@link ./onboarding.client}, and for the same
 * reason: whether a user has worked through the checklist is a pure client-side
 * concern that has no business round-tripping through the sidecar's AppSettings.
 *
 * Only two things are persisted: whether the tour is *on* (the user opted in at
 * the end of onboarding, or replayed it from Settings) and which routes they
 * have visited. Every step's done-ness is otherwise derived from real app state
 * — a patrol step ticks because a patrol exists, not because a button was
 * clicked — so the checklist can never claim progress the user didn't make.
 */

const TOUR_KEY = "myra:tour:v1";

/** Routes whose first visit ticks part of the checklist. */
export const TOUR_ROUTES = {
  runs: "/runs",
  schedules: "/schedules",
  history: "/history",
  runDetail: "/history/run",
} as const;

export type TourRoute = (typeof TOUR_ROUTES)[keyof typeof TOUR_ROUTES];

/** The checklist entries, and equally the spotlight flows keyed off them. */
export type TourStepId = "explore" | "patrol" | "run";

export interface TourState {
  /** The user asked to be guided. When false the checklist stays hidden. */
  enabled: boolean;
  /** Routes visited since the tour was (re)started. */
  visited: TourRoute[];
}

const EMPTY: TourState = { enabled: false, visited: [] };

const ALL_ROUTES: readonly string[] = Object.values(TOUR_ROUTES);

function isTourRoute(value: unknown): value is TourRoute {
  return typeof value === "string" && ALL_ROUTES.includes(value);
}

/** Read the persisted tour state. Never throws — a bad blob reads as "off". */
export function readTour(): TourState {
  try {
    const raw = window.localStorage.getItem(TOUR_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY;
    const { enabled, visited } = parsed as Partial<TourState>;
    return {
      enabled: enabled === true,
      visited: Array.isArray(visited) ? visited.filter(isTourRoute) : [],
    };
  } catch {
    return EMPTY;
  }
}

export function writeTour(state: TourState): void {
  try {
    window.localStorage.setItem(TOUR_KEY, JSON.stringify(state));
  } catch {
    /* localStorage unavailable — the checklist degrades to in-memory only */
  }
}

/**
 * Turn the checklist on and wipe prior progress — used both by the onboarding
 * "Show me around" CTA and the Settings replay button, so replaying always
 * starts from an empty checklist rather than an already-ticked one.
 */
export function startTour(): TourState {
  const next: TourState = { enabled: true, visited: [] };
  writeTour(next);
  return next;
}

/** Hide the checklist for good (the X on the card). Progress is discarded. */
export function stopTour(): TourState {
  writeTour(EMPTY);
  return EMPTY;
}

/**
 * Record a visit. Returns the new state, or `null` when nothing changed — the
 * caller uses that to skip a pointless write + re-render on every navigation.
 */
export function recordVisit(state: TourState, pathname: string): TourState | null {
  if (!state.enabled) return null;
  // `/history/run` must win over `/history`: match the most specific route only,
  // otherwise the run-detail visit would also tick the plain History entry.
  const match = [...ALL_ROUTES].sort((a, b) => b.length - a.length).find((r) => pathname === r || pathname === `${r}/`);
  if (!isTourRoute(match) || state.visited.includes(match)) return null;
  const next: TourState = { ...state, visited: [...state.visited, match] };
  writeTour(next);
  return next;
}
