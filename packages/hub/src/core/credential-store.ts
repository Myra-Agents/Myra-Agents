/**
 * The relay's small durable state shape — shared by every host (Node JSON file,
 * Cloudflare DO storage). Kept free of any runtime imports so the Cloudflare
 * build doesn't drag in Node's `fs`.
 */

/** A machine enrolled to a user. The `jti` ties it to its current credential. */
export interface EnrolledInstance {
  userId: string;
  instanceId: string;
  label: string;
  jti: string;
  enrolledAt: string;
}

/**
 * Durable state {@link AuthService} needs. Sync on the JSON-file host, async on
 * the Cloudflare DO host — return types allow either.
 */
export interface CredentialStore {
  addInstance(rec: EnrolledInstance): void | Promise<void>;
  isRevoked(jti: string): boolean | Promise<boolean>;
  revoke(userId: string, instanceId: string): boolean | Promise<boolean>;
  list(userId: string): EnrolledInstance[] | Promise<EnrolledInstance[]>;
}
