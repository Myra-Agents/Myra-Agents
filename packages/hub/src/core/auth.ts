import { sign, verify } from "hono/jwt";

import type { CredentialStore } from "./credential-store";

/**
 * Identity for the relay (transport-agnostic).
 *
 * Two token kinds, both HS256-signed with the hub secret:
 *  - **session** — short-lived, carries `userId`; held by a dashboard.
 *  - **instance** — long-lived, carries `(userId, instanceId, jti)`; held by a
 *    machine, obtained by exchanging a one-time pairing code.
 *
 * The identity *proof* for a session (who is this user?) is pluggable — phase 1
 * of the cloud rollout wires OIDC / magic-link here; the dev login below is the
 * placeholder behind `MYRA_HUB_DEV_LOGIN`.
 */
export interface SessionClaims {
  sub: string;
  typ: "session";
  exp: number;
}
export interface InstanceClaims {
  sub: string;
  iid: string;
  jti: string;
  typ: "instance";
  exp: number;
}

const SESSION_TTL_S = 60 * 60; // 1h
const INSTANCE_TTL_S = 60 * 60 * 24 * 90; // 90d
const PAIRING_TTL_MS = 10 * 60 * 1000; // 10min

interface PairingEntry {
  userId: string;
  expiresAt: number;
}

export class AuthService {
  private pairing = new Map<string, PairingEntry>();

  constructor(
    private readonly secret: string,
    private readonly store: CredentialStore,
  ) {}

  // --- user sessions --------------------------------------------------------

  async issueSession(userId: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
    return sign({ sub: userId, typ: "session", exp }, this.secret, "HS256");
  }

  /** Verify a session token → userId. Throws on bad/expired/wrong-type tokens. */
  async verifySession(token: string): Promise<string> {
    const claims = (await verify(token, this.secret, "HS256")) as unknown as SessionClaims;
    if (claims.typ !== "session") throw new Error("not a session token");
    return claims.sub;
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
    await this.store.addInstance({ userId, instanceId, label, jti, enrolledAt: new Date().toISOString() });
    return sign({ sub: userId, iid: instanceId, jti, typ: "instance", exp }, this.secret, "HS256");
  }

  /** Verify an instance credential → claims. Throws if bad/expired/wrong-type/revoked. */
  async verifyInstance(token: string): Promise<InstanceClaims> {
    const claims = (await verify(token, this.secret, "HS256")) as unknown as InstanceClaims;
    if (claims.typ !== "instance") throw new Error("not an instance token");
    if (await this.store.isRevoked(claims.jti)) throw new Error("credential revoked");
    return claims;
  }

  /** Revoke a user's instance credential. Returns true if it existed. */
  revoke(userId: string, instanceId: string): boolean | Promise<boolean> {
    return this.store.revoke(userId, instanceId);
  }

  listEnrolled(userId: string) {
    return this.store.list(userId);
  }
}
