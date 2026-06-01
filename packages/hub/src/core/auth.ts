import type { AccountInfo, SessionClaims } from "@myra/shared";
import { sign, verify } from "hono/jwt";

import type { RefreshStore } from "./auth-stores";
import type { CredentialStore } from "./credential-store";

/**
 * Identity for the relay (transport-agnostic).
 *
 * Token kinds, all HS256-signed with the hub secret:
 *  - **session** — short-lived, carries `userId` + tier/role/orgId claims; held
 *    by a dashboard. Refreshed via an opaque **refresh** token (single-use,
 *    rotated, revocable — stored in {@link RefreshStore}).
 *  - **instance** — long-lived, carries `(userId, instanceId, jti)`; held by a
 *    machine, obtained by exchanging a one-time pairing code.
 *
 * The identity *proof* for a session (who is this user?) is no longer the dev
 * stub: the host front door verifies a managed-IdP (Clerk) token and calls
 * {@link issueSession} with the resolved account. Sessions + refresh are owned
 * here so the connector and Tauri webview never depend on the IdP SDK.
 */
export interface InstanceClaims {
  sub: string;
  iid: string;
  jti: string;
  typ: "instance";
  exp: number;
}

const SESSION_TTL_S = 15 * 60; // 15min
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const INSTANCE_TTL_S = 60 * 60 * 24 * 90; // 90d
const PAIRING_TTL_MS = 10 * 60 * 1000; // 10min

interface PairingEntry {
  userId: string;
  expiresAt: number;
}

export interface AuthStores {
  /** Per-user enrolled-instance state (the per-user DO, on the CF host). */
  credentials?: CredentialStore;
  /** Refresh-token state (the host front door, on the CF host). */
  refresh?: RefreshStore;
}

export class AuthService {
  private pairing = new Map<string, PairingEntry>();
  private readonly credentials?: CredentialStore;
  private readonly refreshStore?: RefreshStore;

  constructor(
    private readonly secret: string,
    stores: AuthStores = {},
  ) {
    this.credentials = stores.credentials;
    this.refreshStore = stores.refresh;
  }

  private credentialStore(): CredentialStore {
    if (!this.credentials) throw new Error("AuthService: no credential store configured");
    return this.credentials;
  }
  private refresh(): RefreshStore {
    if (!this.refreshStore) throw new Error("AuthService: no refresh store configured");
    return this.refreshStore;
  }

  // --- user sessions --------------------------------------------------------

  /** Mint a short-lived session JWT carrying the account's tier/role/orgId. */
  async issueSession(account: AccountInfo): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
    const claims: SessionClaims = {
      sub: account.userId,
      typ: "session",
      tier: account.tier,
      role: account.role,
      orgId: account.orgId,
      exp,
    };
    return sign({ ...claims }, this.secret, "HS256");
  }

  /** Verify a session token → claims. Throws on bad/expired/wrong-type tokens. */
  async verifySession(token: string): Promise<SessionClaims> {
    const claims = (await verify(token, this.secret, "HS256")) as unknown as SessionClaims;
    if (claims.typ !== "session") throw new Error("not a session token");
    return claims;
  }

  // --- refresh tokens -------------------------------------------------------

  /** Mint an opaque, single-use refresh token bound to a user. */
  async issueRefresh(userId: string): Promise<string> {
    const token = crypto.randomUUID().replace(/-/g, "");
    await this.refresh().put(token, { userId, exp: Date.now() + REFRESH_TTL_MS });
    return token;
  }

  /** Consume a refresh token (single-use) → userId. Throws if invalid/expired/reused. */
  async consumeRefresh(token: string): Promise<{ userId: string }> {
    const rec = await this.refresh().take(token.trim());
    if (!rec) throw new Error("invalid refresh token");
    if (Date.now() > rec.exp) throw new Error("refresh token expired");
    return { userId: rec.userId };
  }

  /** Revoke a refresh token (logout). Idempotent. */
  async revokeRefresh(token: string): Promise<void> {
    await this.refresh().del(token.trim());
  }

  // --- pairing + enrollment -------------------------------------------------

  /** Mint a one-time, short-TTL pairing code bound to a user. */
  mintPairingCode(userId: string): { code: string; expiresAt: number } {
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    this.pairing.set(code, { userId, expiresAt });
    return { code, expiresAt };
  }

  /** Exchange a pairing code for an instance credential. Single-use; throws if invalid/expired. */
  async enroll(code: string, instanceId: string, label: string): Promise<{ token: string; userId: string }> {
    const entry = this.pairing.get(code.trim().toUpperCase());
    this.pairing.delete(code.trim().toUpperCase());
    if (!entry) throw new Error("invalid pairing code");
    if (Date.now() > entry.expiresAt) throw new Error("pairing code expired");

    const token = await this.issueInstanceCredential(entry.userId, instanceId, label);
    return { token, userId: entry.userId };
  }

  /**
   * Mint an instance credential directly (no pairing-code step). Used by the
   * Cloudflare host, where the pairing code → userId mapping is resolved in KV
   * by the Worker before routing to the user's Durable Object.
   */
  async issueInstanceCredential(userId: string, instanceId: string, label: string): Promise<string> {
    const jti = crypto.randomUUID();
    const exp = Math.floor(Date.now() / 1000) + INSTANCE_TTL_S;
    await this.credentialStore().addInstance({ userId, instanceId, label, jti, enrolledAt: new Date().toISOString() });
    return sign({ sub: userId, iid: instanceId, jti, typ: "instance", exp }, this.secret, "HS256");
  }

  /** Verify an instance credential → claims. Throws if bad/expired/wrong-type/revoked. */
  async verifyInstance(token: string): Promise<InstanceClaims> {
    const claims = (await verify(token, this.secret, "HS256")) as unknown as InstanceClaims;
    if (claims.typ !== "instance") throw new Error("not an instance token");
    if (await this.credentialStore().isRevoked(claims.jti)) throw new Error("credential revoked");
    return claims;
  }

  /** Revoke a user's instance credential. Returns true if it existed. */
  revoke(userId: string, instanceId: string): boolean | Promise<boolean> {
    return this.credentialStore().revoke(userId, instanceId);
  }

  listEnrolled(userId: string) {
    return this.credentialStore().list(userId);
  }
}
