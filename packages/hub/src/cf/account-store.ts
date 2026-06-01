/// <reference types="@cloudflare/workers-types" />
import type { AccountInfo } from "@myra/shared";

import type { AccountStore } from "../core/auth-stores";

/**
 * {@link AccountStore} over a Worker KV namespace. Cross-user, lives at the
 * front door (not in a per-user DO) because the account is resolved before we
 * know which DO to route to. Holds only account metadata — never boards.
 */
export class KvAccountStore implements AccountStore {
  constructor(private readonly kv: KVNamespace) {}

  async get(userId: string): Promise<AccountInfo | null> {
    const raw = await this.kv.get(`acct:${userId}`);
    return raw ? (JSON.parse(raw) as AccountInfo) : null;
  }

  async upsert(account: AccountInfo): Promise<void> {
    await this.kv.put(`acct:${account.userId}`, JSON.stringify(account));
  }
}
