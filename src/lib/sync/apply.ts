/**
 * Reconcile a decrypted {@link SyncedSet} onto **this device's** local sidecar.
 * Reuses the Phase 1 fan-out apply path ({@link deployInstance}/{@link removeInstance});
 * the only difference is the *source* — the vault, not the connect wizard.
 *
 * Safety: only instance ids the vault knows about are touched. Instances created
 * locally but never synced (Phase 1 direct fan-out) are left untouched, so the
 * two models coexist without clobbering each other.
 */

import { connectionManager } from "@/lib/connections/manager";
import { deployInstance, removeInstance } from "@/lib/integrations/deploy";

import type { SyncedInstance, SyncedSet } from "./sync";

/** The connection backing this machine's local board (the sidecar / `local`). */
function localConnId(): string {
  const conns = connectionManager.list();
  const local = conns.find((c) => c.kind === "sidecar") ?? conns.find((c) => c.id === "local");
  return local?.id ?? "local";
}

function secretInputs(s: SyncedInstance): { key: string; value: string }[] {
  return Object.entries(s.secrets).map(([key, value]) => ({ key, value }));
}

/**
 * Apply the synced set to the local sidecar: deploy every instance targeted at
 * this device (with its decrypted secrets), and remove every sync-managed
 * instance that's deleted or no longer targeted here. Returns the number of
 * instances applied + removed for status reporting.
 */
export async function applyToLocal(set: SyncedSet, deviceId: string): Promise<{ applied: number; removed: number }> {
  const connId = localConnId();
  let applied = 0;
  let removed = 0;

  for (const s of Object.values(set)) {
    const targetedHere = !s.deleted && (s.targets.length === 0 || s.targets.includes(deviceId));
    if (targetedHere) {
      await deployInstance({
        instance: s.instance,
        secrets: secretInputs(s),
        selectedConnIds: [connId],
        allConnIds: [connId],
        secretKeys: Object.keys(s.secrets),
      });
      applied++;
    } else {
      // Deleted or not for this device — ensure it's gone locally. Secret key
      // names come from the synced record (empty for a tombstone is acceptable —
      // the leftover keychain entry is local-only, never on the hub).
      await removeInstance({
        instanceId: s.instance.id,
        allConnIds: [connId],
        secretKeys: Object.keys(s.secrets),
      });
      removed++;
    }
  }

  return { applied, removed };
}
