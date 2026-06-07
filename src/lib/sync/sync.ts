/**
 * Sync orchestration: the synced instance set, its last-writer-wins merge, and
 * the push/pull-over-the-vault transport.
 *
 * Each push encrypts the **entire** instance set as one snapshot under the vault
 * key, so a receiver only needs the newest delta to converge (matching the hub's
 * coalesce-to-newest queue). Merge is **per instance**: different instances union,
 * the same instance is resolved last-writer-wins by `(version, ts, origin)`.
 * No per-field merge in v1.
 */

import type { PluginInstance } from "@/types/settings";

import * as hub from "./hub-sync";
import { decryptPayload, encryptPayload } from "./vault";

/** One instance as it travels in the vault — config + targeting + **secrets**. */
export interface SyncedInstance {
  instance: PluginInstance;
  /** Secret field values (plaintext inside the vault; encrypted at rest + on the wire). */
  secrets: Record<string, string>;
  /** Device ids this instance deploys to; empty = every device. */
  targets: string[];
  /** Monotonic per-instance edit counter (LWW primary key). */
  version: number;
  /** Edit wall-clock (LWW tiebreak). */
  ts: number;
  /** Last-writer device id (LWW final tiebreak — deterministic). */
  origin: string;
  /** Tombstone — a removed instance, kept so the deletion propagates. */
  deleted?: boolean;
}

/** The whole synced set, keyed by instance id. */
export type SyncedSet = Record<string, SyncedInstance>;

/** Strict "is `a` a later write than `b`?" using the LWW key. */
function isNewer(a: SyncedInstance, b: SyncedInstance): boolean {
  if (a.version !== b.version) return a.version > b.version;
  if (a.ts !== b.ts) return a.ts > b.ts;
  return a.origin > b.origin;
}

/**
 * Merge `incoming` into `base`, last-writer-wins per instance. Pure — no I/O.
 * Different instances are unioned; the same instance keeps the later write
 * (including tombstones, so deletes propagate).
 */
export function mergeSets(base: SyncedSet, incoming: SyncedSet): SyncedSet {
  const out: SyncedSet = { ...base };
  for (const [id, inc] of Object.entries(incoming)) {
    const cur = out[id];
    if (!cur || isNewer(inc, cur)) out[id] = inc;
  }
  return out;
}

/** Bump an instance for a new local edit (or create the synced record). */
export function bumpInstance(
  prev: SyncedInstance | undefined,
  next: Omit<SyncedInstance, "version" | "ts" | "origin" | "deleted">,
  deviceId: string,
): SyncedInstance {
  return {
    ...next,
    version: (prev?.version ?? 0) + 1,
    ts: Date.now(),
    origin: deviceId,
  };
}

/** Mark an instance deleted (a tombstone that out-versions the prior write). */
export function tombstone(prev: SyncedInstance, deviceId: string): SyncedInstance {
  return { ...prev, version: prev.version + 1, ts: Date.now(), origin: deviceId, deleted: true, secrets: {} };
}

// ── transport ─────────────────────────────────────────────────────────

/** Encrypt the full set under the vault key and push it to every other device. */
export async function pushSet(vaultKey: Uint8Array, deviceId: string, set: SyncedSet): Promise<void> {
  const ciphertext = encryptPayload(vaultKey, set);
  await hub.pushDelta(deviceId, ciphertext);
}

/**
 * Pull this device's queued deltas, decrypt + merge them into `base` (oldest
 * first), ack them so the hub purges, and return the converged set. Deltas this
 * device authored are skipped. Undecryptable deltas (e.g. from before a vault
 * rotation) are dropped, not fatal.
 */
export async function pullAndMerge(vaultKey: Uint8Array, deviceId: string, base: SyncedSet): Promise<SyncedSet> {
  const { deltas } = await hub.pullDeltas(deviceId);
  let merged = base;
  const acked: number[] = [];
  for (const delta of deltas) {
    acked.push(delta.seq);
    if (delta.from === deviceId) continue;
    try {
      const incoming = decryptPayload<SyncedSet>(vaultKey, delta.ciphertext);
      merged = mergeSets(merged, incoming);
    } catch (e) {
      console.warn(`[sync] dropping undecryptable delta seq ${delta.seq}:`, e);
    }
  }
  if (acked.length > 0) await hub.ackDeltas(deviceId, acked);
  return merged;
}

/** The instances (non-tombstoned) this device should run, given its `deviceId`. */
export function instancesForDevice(set: SyncedSet, deviceId: string): SyncedInstance[] {
  return Object.values(set).filter((s) => !s.deleted && (s.targets.length === 0 || s.targets.includes(deviceId)));
}

/** Re-export for consumers that build a {@link SyncedInstance} from a plain instance. */
export type { PluginInstance };
