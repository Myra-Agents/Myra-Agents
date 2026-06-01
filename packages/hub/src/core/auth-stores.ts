/**
 * Cross-user durable state for authentication — kept at the host front door
 * (Worker KV / Node JSON file), NOT in the per-user Durable Object: accounts and
 * refresh tokens are global (looked up before we know which DO to route to).
 * Free of runtime imports so the Cloudflare build never drags in Node's `fs`.
 */

import type { AccountInfo } from "@myra/shared";

/** Per-user account record. `tier` is set manually for now (no billing). */
export interface AccountStore {
  get(userId: string): AccountInfo | null | undefined | Promise<AccountInfo | null | undefined>;
  upsert(account: AccountInfo): void | Promise<void>;
}

/** A live refresh token: which user it belongs to and when it expires (ms epoch). */
export interface RefreshRecord {
  userId: string;
  exp: number;
}

/**
 * Refresh-token store. The opaque token IS the key (a random id), so there is
 * nothing to verify cryptographically — presence in the store is the proof, and
 * single-use rotation ({@link take}) gives revocation + reuse detection.
 */
export interface RefreshStore {
  put(token: string, rec: RefreshRecord): void | Promise<void>;
  /** Atomically read + delete (single-use). Returns null if absent. */
  take(token: string): RefreshRecord | null | undefined | Promise<RefreshRecord | null | undefined>;
  del(token: string): void | Promise<void>;
}

/** One-time desktop handoff: a short-lived code → the tokens the desktop claims. */
export interface HandoffStore {
  put(code: string, tokens: { session: string; refresh: string }): void | Promise<void>;
  take(
    code: string,
  ):
    | { session: string; refresh: string }
    | null
    | undefined
    | Promise<{ session: string; refresh: string } | null | undefined>;
}
