import { useCallback, useEffect, useState } from "react";

import { invoke, isTauri } from "@tauri-apps/api/core";

import { connectionManager } from "@/lib/connections/manager";

/** Mirror of the Rust `RemoteStatus` (`#[serde(rename_all = "camelCase")]`). */
export interface RemoteStatus {
  enrolled: boolean;
  hubUrl: string | null;
  userId: string | null;
  instanceId: string | null;
  label: string | null;
  running: boolean;
}

/**
 * Desktop-only wrapper around the §3 Tauri remote-access commands. These call
 * Tauri `invoke` directly (like `get_sidecar_port`), not the connection RPC
 * seam — they operate on this machine. After enable/disable it refreshes the
 * local backend so the board re-points at the adopted service (or a re-spawned
 * ephemeral sidecar).
 */
export function useRemoteAccess() {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const next = await invoke<RemoteStatus>("remote_access_status");
      setStatus(next);
    } catch (e) {
      console.error("[useRemoteAccess] status failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(
    async (hubUrl: string, code: string, label: string) => {
      setBusy(true);
      try {
        await invoke("enable_remote_access", { hubUrl, code, label });
        await connectionManager.refreshLocal();
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await invoke("disable_remote_access");
      await connectionManager.refreshLocal();
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { status, loading, busy, refresh, enable, disable };
}
