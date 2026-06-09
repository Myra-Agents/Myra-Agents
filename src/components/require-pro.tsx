"use client";

import type { ReactNode } from "react";

/**
 * Pro / user-connection gate **removed** — the app runs local-only and always
 * shows the board (no web upsell, no sign-in wall). Kept as a passthrough so the
 * layout import stays stable; restore the entitlement gate from git history to
 * bring back the {@link UpsellScreen} for free web users.
 */
export function RequirePro({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
