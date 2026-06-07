import { useCallback, useEffect, useState } from "react";

import { applyToLocal } from "@/lib/sync/apply";
import * as hub from "@/lib/sync/hub-sync";
import type { SyncedSet } from "@/lib/sync/sync";
import * as session from "@/lib/sync/vault-session";

/** localStorage mirror of the converged synced set (this device's working copy). */
const SET_KEY = "myra.sync.set";

function readSet(): SyncedSet {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SET_KEY) ?? "{}") as SyncedSet;
  } catch {
    return {};
  }
}
function writeSet(set: SyncedSet): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SET_KEY, JSON.stringify(set));
  } catch {
    // best-effort cache; the hub remains the source of truth.
  }
}

/**
 * Reactive E2E-sync surface for Settings → Sync. Owns the session status and the
 * setup/join/unlock/revoke/sync actions; pull+apply reconciles the synced set
 * onto the local sidecar. The vault key lives only in the session memory of
 * `vault-session`.
 */
export function useSync() {
  const [status, setStatus] = useState<session.SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await session.getStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const out = await fn();
        await refresh();
        return out;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const setUp = useCallback((label: string) => run(() => session.setUpSync(label)), [run]);
  const unlock = useCallback(() => run(() => session.unlockExisting()), [run]);
  const join = useCallback((code: string, label: string) => run(() => session.joinWithRecovery(code, label)), [run]);
  const revoke = useCallback((deviceId: string) => run(() => session.revokeDevice(deviceId)), [run]);
  const leave = useCallback(() => run(() => session.leaveSync()), [run]);

  /** Push local edits, pull remote deltas, and apply the converged set locally. */
  const syncNow = useCallback(
    () =>
      run(async () => {
        const st = await session.getStatus();
        if (!st.deviceId || !session.isUnlocked()) throw new Error("unlock sync first");
        const key = session.vaultKey();
        const base = readSet();
        // Pull + merge first, then apply, then push the converged snapshot.
        const { pullAndMerge, pushSet } = await import("@/lib/sync/sync");
        const merged = await pullAndMerge(key, st.deviceId, base);
        writeSet(merged);
        await applyToLocal(merged, st.deviceId);
        await pushSet(key, st.deviceId, merged);
      }),
    [run],
  );

  return {
    status,
    busy,
    error,
    available: hub.isSyncAvailable(),
    setUp,
    unlock,
    join,
    revoke,
    leave,
    syncNow,
    refresh,
  };
}
