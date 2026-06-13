// app.config.ts — the app under test. One place to retarget this app's suite.
//
// `windowTitle` is how the AX driver finds the running app: it scans visible
// processes for a window whose title matches exactly. More robust than the
// process name, which for dev builds often differs from the display name.

export const APP = {
  /** Exact window title to drive (set by the app's framework config). */
  windowTitle: "Myra Agents",
  /** Human label for reports. */
  name: "Myra Agents",
} as const;
