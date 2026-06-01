import { isTauri } from "@tauri-apps/api/core";

import { connectionManager } from "@/lib/connections/manager";

export type Tier = "free" | "pro";
export type Role = "admin" | "member";

export interface Entitlement {
  tier: Tier;
  isPro: boolean;
  /** Org role. Surfaced now, not enforced — admin-sees-all is a hub follow-up. */
  role: Role;
  orgId?: string;
}

/** Build-time tier override: `NEXT_PUBLIC_MYRA_TIER=pro|free`. */
function envTier(): Tier | undefined {
  const v = process.env.NEXT_PUBLIC_MYRA_TIER?.trim().toLowerCase();
  return v === "pro" || v === "free" ? v : undefined;
}

/**
 * STUB entitlement resolver — the single seam where tier/role is decided, so
 * real billing / hub-reported entitlement can swap in here later without
 * touching any call site. Source order (per the remote-access plan):
 *  - web: a registered hub (a logged-in hub user) ⇒ Pro; otherwise the env
 *    override; otherwise default `free`.
 *  - desktop: the env override; otherwise default `free` (free desktop keeps the
 *    local-only board).
 * `role`/`orgId` come from env stubs for now — populated and displayed, but not
 * enforced this round.
 */
export function resolveEntitlement(): Entitlement {
  const env = envTier();
  const hasHubSession = !isTauri() && connectionManager.listHubs().length > 0;
  const tier: Tier = hasHubSession ? "pro" : (env ?? "free");
  const role: Role = process.env.NEXT_PUBLIC_MYRA_ROLE === "admin" ? "admin" : "member";
  const orgId = process.env.NEXT_PUBLIC_MYRA_ORG_ID?.trim() || undefined;
  return { tier, isPro: tier === "pro", role, orgId };
}
