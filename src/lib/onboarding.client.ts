/**
 * First-run onboarding state. Stored app-locally (not in server-persisted
 * AppSettings, which round-trips through the prebuilt sidecar and would drop
 * unknown fields) — whether a user has seen the welcome wizard is a pure
 * client-side concern.
 *
 * The value is the wizard *version* that was completed, so bumping
 * {@link ONBOARDING_VERSION} re-shows the wizard after a materially new
 * first-run flow ships (rather than storing a bare boolean we can never revisit).
 */

const ONBOARDING_KEY = "myra:onboarding:completedVersion";

/** Bump when the onboarding flow changes enough to re-show it to everyone. */
export const ONBOARDING_VERSION = 1;

/** True once the user has finished (or skipped) the current onboarding version. */
export function isOnboardingComplete(): boolean {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return false;
    return Number.parseInt(raw, 10) >= ONBOARDING_VERSION;
  } catch {
    // localStorage unavailable — never trap the user behind a wizard we can't
    // dismiss, so treat it as already complete.
    return true;
  }
}

/** Mark the current onboarding version as done (finished or skipped). */
export function completeOnboarding(): void {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, String(ONBOARDING_VERSION));
  } catch {
    /* localStorage unavailable */
  }
}
