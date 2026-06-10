import { useCallback, useEffect, useState } from "react";

import { invoke, isTauri } from "@tauri-apps/api/core";

import { connectionManager } from "@/lib/connections/manager";

/** Mirror of the Rust `LocalServerStatus` (`#[serde(rename_all = "camelCase")]`). */
export interface LocalServerStatus {
  /** Persistent copy present at the stable path (`~/.myra-agents/bin`). */
  installed: boolean;
  /** Version stamped beside the installed copy (`null` if absent/unstamped). */
  version: string | null;
  /** Server version this app build ships embedded. */
  embeddedVersion: string;
  /** Answering `GET /healthz` right now. */
  running: boolean;
  /** Port the local connection targets. */
  port: number;
  /** Hub enrollment layered on top (remote access). */
  enrolled: boolean;
  hubUrl: string | null;
  label: string | null;
}

/**
 * Desktop-only wrapper around the local-server Tauri commands. Like
 * `useRemoteAccess`, these `invoke` directly — they install/manage the server on
 * *this* machine. After install/uninstall it refreshes the local backend so the
 * board re-points at the adopted service (or the re-spawned ephemeral sidecar)
 * and picks up the matching localhost token.
 */
export function useLocalServer() {
  const [status, setStatus] = useState<LocalServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      setStatus(await invoke<LocalServerStatus>("local_server_status"));
    } catch (e) {
      console.error("[useLocalServer] status failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = useCallback(async () => {
    setBusy(true);
    try {
      const next = await invoke<LocalServerStatus>("install_local_server");
      setStatus(next);
      await connectionManager.refreshLocal();
    } finally {
      setBusy(false);
    }
  }, []);

  const uninstall = useCallback(async () => {
    setBusy(true);
    try {
      const next = await invoke<LocalServerStatus>("uninstall_local_server");
      setStatus(next);
      await connectionManager.refreshLocal();
    } finally {
      setBusy(false);
    }
  }, []);

  /** Installed copy is older than what this app embeds → an update is available. */
  const updateAvailable =
    !!status?.installed &&
    status.embeddedVersion !== "unknown" &&
    status.version !== null &&
    status.version !== status.embeddedVersion;

  return { status, loading, busy, updateAvailable, refresh, install, uninstall };
}
