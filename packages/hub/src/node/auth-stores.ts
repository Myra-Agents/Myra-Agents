import type { AccountInfo } from "@myra/shared";

import type { AccountStore, HandoffStore, RefreshRecord, RefreshStore } from "../core/auth-stores";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Node-host auth stores for the self-hosted gateway. Accounts persist to a JSON
 * file (they outlive restarts); refresh tokens + desktop handoff codes live in
 * memory (single process — ephemeral, like the Node host's pairing codes).
 */
export class JsonAccountStore implements AccountStore {
  constructor(private readonly file: string) {}

  private read(): Record<string, AccountInfo> {
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Record<string, AccountInfo>;
    } catch {
      return {};
    }
  }

  get(userId: string): AccountInfo | null {
    return this.read()[userId] ?? null;
  }

  upsert(account: AccountInfo): void {
    const all = this.read();
    all[account.userId] = account;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(all, null, 2));
  }
}

export class MemRefreshStore implements RefreshStore {
  private map = new Map<string, RefreshRecord>();
  put(token: string, rec: RefreshRecord): void {
    this.map.set(token, rec);
  }
  take(token: string): RefreshRecord | null {
    const rec = this.map.get(token) ?? null;
    this.map.delete(token);
    return rec;
  }
  del(token: string): void {
    this.map.delete(token);
  }
}

const HANDOFF_TTL_MS = 5 * 60 * 1000;

export class MemHandoffStore implements HandoffStore {
  private map = new Map<string, { tokens: { session: string; refresh: string }; exp: number }>();
  put(code: string, tokens: { session: string; refresh: string }): void {
    this.map.set(code, { tokens, exp: Date.now() + HANDOFF_TTL_MS });
  }
  take(code: string): { session: string; refresh: string } | null {
    const entry = this.map.get(code);
    this.map.delete(code);
    if (!entry || Date.now() > entry.exp) return null;
    return entry.tokens;
  }
}
