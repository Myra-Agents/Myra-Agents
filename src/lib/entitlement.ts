import { getAccount, isAuthenticated } from "@/lib/auth/session";

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
 * The single seam where tier/role is decided. With a real auth session, the
 * tier/role/orgId come straight from the hub-issued session claims (the account
 * record, set by Clerk org claims + manual tier). With no session it falls back
 * to the env override (desktop/local testing), else `free` — so free desktop
 * keeps its local-only board. Real billing later only changes how the account
 * record's `tier` is set, not this resolver.
 */
export function resolveEntitlement(): Entitlement {
  const account = isAuthenticated() ? getAccount() : null;
  if (account) {
    return { tier: account.tier, isPro: account.tier === "pro", role: account.role, orgId: account.orgId };
  }
  const tier: Tier = envTier() ?? "free";
  const role: Role = process.env.NEXT_PUBLIC_MYRA_ROLE === "admin" ? "admin" : "member";
  const orgId = process.env.NEXT_PUBLIC_MYRA_ORG_ID?.trim() || undefined;
  return { tier, isPro: tier === "pro", role, orgId };
}
