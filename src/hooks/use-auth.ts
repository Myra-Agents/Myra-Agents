import type { AccountInfo } from "@myra/shared";

/**
 * User connection (Clerk identity + hub-issued session) is **disabled** — the
 * app runs local-only with no sign-in. This stub keeps the `useAuth` surface so
 * every consumer still compiles, but it never authenticates: no account, no
 * sign-in/out. To bring the feature back, restore the Clerk + `lib/auth/session`
 * implementation from git history (and re-mount `AuthBootstrap`).
 */
export function useAuth() {
  return {
    account: null as AccountInfo | null,
    isAuthenticated: false,
    /** Auth is never usable while the user connection is disabled. */
    configured: false,
    busy: false,
    signIn: async () => undefined,
    signOut: async () => undefined,
  };
}
