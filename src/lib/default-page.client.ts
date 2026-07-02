/**
 * The page Myra lands on at startup. Stored app-locally (not in server-persisted
 * AppSettings, which round-trips through the prebuilt sidecar and would drop or
 * reject unknown values) — it's a pure client-side navigation preference.
 */
export type DefaultPage = "operations" | "patrols" | "history";

export const DEFAULT_PAGE: DefaultPage = "operations";

const DEFAULT_PAGE_KEY = "myra:settings:defaultPage";

/** Route each default-page choice maps to. */
const ROUTES: Record<DefaultPage, string> = {
  operations: "/runs",
  patrols: "/schedules",
  history: "/history",
};

function isDefaultPage(value: string | null): value is DefaultPage {
  return value === "operations" || value === "patrols" || value === "history";
}

export function getDefaultPageSetting(): DefaultPage {
  try {
    const stored = window.localStorage.getItem(DEFAULT_PAGE_KEY);
    return isDefaultPage(stored) ? stored : DEFAULT_PAGE;
  } catch {
    return DEFAULT_PAGE;
  }
}

export function setDefaultPageSetting(value: DefaultPage): void {
  try {
    window.localStorage.setItem(DEFAULT_PAGE_KEY, value);
  } catch {
    /* localStorage unavailable */
  }
}

/** The route to navigate to for a given (or the configured) default page. */
export function defaultPageRoute(page: DefaultPage = getDefaultPageSetting()): string {
  return ROUTES[page] ?? ROUTES[DEFAULT_PAGE];
}
