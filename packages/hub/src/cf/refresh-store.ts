/// <reference types="@cloudflare/workers-types" />
import type { HandoffStore, RefreshRecord, RefreshStore } from "../core/auth-stores";

/** Short TTL for a one-time desktop handoff code (seconds). */
const HANDOFF_TTL_S = 300;

/**
 * {@link RefreshStore} over a Worker KV namespace. The token is the key; KV's
 * `expirationTtl` enforces the refresh TTL, and {@link take} deletes on read so
 * a token is single-use (rotation detects reuse — a second take returns null).
 */
export class KvRefreshStore implements RefreshStore {
  constructor(private readonly kv: KVNamespace) {}

  async put(token: string, rec: RefreshRecord): Promise<void> {
    const ttl = Math.max(60, Math.floor((rec.exp - Date.now()) / 1000));
    await this.kv.put(`rt:${token}`, JSON.stringify(rec), { expirationTtl: ttl });
  }

  async take(token: string): Promise<RefreshRecord | null> {
    const key = `rt:${token}`;
    const raw = await this.kv.get(key);
    if (!raw) return null;
    await this.kv.delete(key);
    return JSON.parse(raw) as RefreshRecord;
  }

  async del(token: string): Promise<void> {
    await this.kv.delete(`rt:${token}`);
  }
}

/** {@link HandoffStore} over Worker KV — short-lived, single-use desktop codes. */
export class KvHandoffStore implements HandoffStore {
  constructor(private readonly kv: KVNamespace) {}

  async put(code: string, tokens: { session: string; refresh: string }): Promise<void> {
    await this.kv.put(`ho:${code}`, JSON.stringify(tokens), { expirationTtl: HANDOFF_TTL_S });
  }

  async take(code: string): Promise<{ session: string; refresh: string } | null> {
    const key = `ho:${code}`;
    const raw = await this.kv.get(key);
    if (!raw) return null;
    await this.kv.delete(key);
    return JSON.parse(raw) as { session: string; refresh: string };
  }
}
