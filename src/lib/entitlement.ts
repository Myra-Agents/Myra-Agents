// User connection disabled — tier/role no longer come from a hub session.
// import { getAccount, isAuthenticated } from "@/lib/auth/session";

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
 * The single seam where tier/role is decided. The hub-session source is
 * commented out with the rest of the user-connection feature, so tier/role/orgId
 * now come from build-time env only (`NEXT_PUBLIC_MYRA_TIER` / `_ROLE` / `_ORG_ID`),
 * else `free` — the local-only board. To restore session-driven entitlement,
 * re-enable the auth read below (see git history).
 */
export function resolveEntitlement(): Entitlement {
  // const account = isAuthenticated() ? getAccount() : null;
  // if (account) {
  //   return { tier: account.tier, isPro: account.tier === "pro", role: account.role, orgId: account.orgId };
  // }
  const tier: Tier = envTier() ?? "free";
  const role: Role = process.env.NEXT_PUBLIC_MYRA_ROLE === "admin" ? "admin" : "member";
  const orgId = process.env.NEXT_PUBLIC_MYRA_ORG_ID?.trim() || undefined;
  return { tier, isPro: tier === "pro", role, orgId };
}
