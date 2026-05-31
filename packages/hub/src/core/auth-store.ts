import type { CredentialStore, EnrolledInstance } from "./credential-store";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type { CredentialStore, EnrolledInstance } from "./credential-store";

interface StoreData {
  instances: EnrolledInstance[];
  revokedJti: string[];
}

/**
 * Tiny JSON-file persistence for the relay's *small* durable state: which
 * instances are enrolled per user, and which credential ids have been revoked.
 * No boards, no card data — the dumb-hub invariant. The Cloudflare host (phase
 * 4) swaps this for Durable Object storage; the shape is identical.
 */
export class AuthStore implements CredentialStore {
  private data: StoreData = { instances: [], revokedJti: [] };

  constructor(private readonly file: string) {
    try {
      this.data = JSON.parse(readFileSync(file, "utf8")) as StoreData;
      this.data.instances ??= [];
      this.data.revokedJti ??= [];
    } catch {
      // first run / missing file — start empty.
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  /** Record a freshly enrolled instance. Re-enrolling the same (user,instance) revokes the old credential. */
  addInstance(rec: EnrolledInstance): void {
    const prior = this.data.instances.find((i) => i.userId === rec.userId && i.instanceId === rec.instanceId);
    if (prior) {
      this.data.revokedJti.push(prior.jti);
      this.data.instances = this.data.instances.filter((i) => i !== prior);
    }
    this.data.instances.push(rec);
    this.save();
  }

  isRevoked(jti: string): boolean {
    return this.data.revokedJti.includes(jti);
  }

  /** Revoke a user's instance: blacklist its credential and forget the enrollment. Returns true if it existed. */
  revoke(userId: string, instanceId: string): boolean {
    const rec = this.data.instances.find((i) => i.userId === userId && i.instanceId === instanceId);
    if (!rec) return false;
    this.data.revokedJti.push(rec.jti);
    this.data.instances = this.data.instances.filter((i) => i !== rec);
    this.save();
    return true;
  }

  list(userId: string): EnrolledInstance[] {
    return this.data.instances.filter((i) => i.userId === userId);
  }
}
