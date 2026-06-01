import type { AccountInfo, Role } from "@myra/shared";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

/**
 * Clerk identity verification, shared by both hosts (CF Worker + Node). Verifies
 * a Clerk-issued JWT against Clerk's JWKS and maps its claims onto our account
 * shape. Clerk only proves identity; the hub mints its own session afterwards.
 */

export interface ClerkConfig {
  issuer: string;
  jwksUrl: string;
  audience?: string;
}

let cache: { url: string; set: ReturnType<typeof createRemoteJWKSet> } | undefined;

/** Verify a Clerk JWT → its payload, or null if invalid. JWKS is cached per URL. */
export async function verifyClerkToken(token: string, cfg: ClerkConfig): Promise<JWTPayload | null> {
  if (!token || !cfg.jwksUrl) return null;
  try {
    if (!cache || cache.url !== cfg.jwksUrl) {
      cache = { url: cfg.jwksUrl, set: createRemoteJWKSet(new URL(cfg.jwksUrl)) };
    }
    const { payload } = await jwtVerify(token, cache.set, {
      issuer: cfg.issuer ? cfg.issuer : undefined,
      audience: cfg.audience ? cfg.audience : undefined,
    });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Map a verified Clerk payload onto an account, preserving the stored `tier`
 * (manual / billing) and falling back to stored values for fields a given token
 * may omit. Org claims vary by Clerk version: top-level `org_id`/`org_role` or
 * the `o` object on newer session tokens.
 */
export function deriveAccount(payload: JWTPayload, existing?: AccountInfo | null): AccountInfo {
  const userId = `clerk:${payload.sub}`;
  const org = (payload.o ?? {}) as { id?: string; rol?: string };
  const email = (typeof payload.email === "string" ? payload.email : undefined) ?? existing?.email;
  const orgId = (typeof payload.org_id === "string" ? payload.org_id : undefined) ?? org.id ?? existing?.orgId;
  const rawRole = (typeof payload.org_role === "string" ? payload.org_role : undefined) ?? org.rol;
  const role: Role = rawRole?.includes("admin") ? "admin" : (existing?.role ?? "member");
  return { userId, email, tier: existing?.tier ?? "free", role, orgId };
}
