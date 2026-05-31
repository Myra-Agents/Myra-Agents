/// <reference types="@cloudflare/workers-types" />
import type { CredentialStore, EnrolledInstance } from "../core/credential-store";

/**
 * {@link CredentialStore} backed by Durable Object transactional storage. Mirrors
 * the JSON-file {@link AuthStore}, one DO per user — small durable state only
 * (enrolled instances + revoked credential ids), never boards.
 */
export class DOCredentialStore implements CredentialStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  private async instances(): Promise<EnrolledInstance[]> {
    return (await this.storage.get<EnrolledInstance[]>("instances")) ?? [];
  }
  private async revoked(): Promise<string[]> {
    return (await this.storage.get<string[]>("revokedJti")) ?? [];
  }

  async addInstance(rec: EnrolledInstance): Promise<void> {
    const list = await this.instances();
    const prior = list.find((i) => i.userId === rec.userId && i.instanceId === rec.instanceId);
    if (prior) {
      const rev = await this.revoked();
      rev.push(prior.jti);
      await this.storage.put("revokedJti", rev);
    }
    const next = list.filter((i) => i !== prior);
    next.push(rec);
    await this.storage.put("instances", next);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.revoked()).includes(jti);
  }

  async revoke(userId: string, instanceId: string): Promise<boolean> {
    const list = await this.instances();
    const rec = list.find((i) => i.userId === userId && i.instanceId === instanceId);
    if (!rec) return false;
    const rev = await this.revoked();
    rev.push(rec.jti);
    await this.storage.put("revokedJti", rev);
    await this.storage.put(
      "instances",
      list.filter((i) => i !== rec),
    );
    return true;
  }

  async list(userId: string): Promise<EnrolledInstance[]> {
    return (await this.instances()).filter((i) => i.userId === userId);
  }
}
