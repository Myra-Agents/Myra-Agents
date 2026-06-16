import { useCallback, useEffect, useState } from "react";

import { connectionManager } from "@/lib/connections/manager";
import type { Connection, HubRegistration } from "@/lib/connections/types";

const VISIBILITY_KEY = "myra.connection-visibility";

function readHidden(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function writeHidden(hidden: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...hidden]));
  } catch {
    // ignore — visibility is a UI nicety, not critical state.
  }
}

/**
 * Reactive view of the connection registry. Re-renders on topology *and* status
 * changes so connection chips/badges stay live. Also owns the per-connection
 * board visibility filter (hidden connections drop out of the aggregated board
 * without disconnecting).
 */
export function useConnections() {
  const [connections, setConnections] = useState<Connection[]>(() => connectionManager.list());
  const [hubs, setHubs] = useState<HubRegistration[]>(() => connectionManager.listHubs());
  const [primaryId, setPrimaryIdState] = useState<string>(() => connectionManager.primaryId());
  const [hidden, setHidden] = useState<Set<string>>(readHidden);

  useEffect(() => {
    const sync = () => {
      setConnections(connectionManager.list());
      setHubs(connectionManager.listHubs());
      setPrimaryIdState(connectionManager.primaryId());
    };
    const offTopology = connectionManager.onTopologyChange(sync);
    const offStatus = connectionManager.onStatusChange(sync);
    sync();
    return () => {
      offTopology();
      offStatus();
    };
  }, []);

  const add = useCallback((input: { label: string; baseUrl: string }) => connectionManager.add(input), []);
  const remove = useCallback((id: string) => connectionManager.remove(id), []);
  const addHub = useCallback(
    (input: { label: string; baseUrl: string; token: string }) => connectionManager.addHub(input),
    [],
  );
  const removeHub = useCallback((id: string) => connectionManager.removeHub(id), []);
  const pairHub = useCallback((id: string) => connectionManager.pairHub(id), []);
  const revokeHubInstance = useCallback(
    (hubId: string, instanceId: string) => connectionManager.revokeHubInstance(hubId, instanceId),
    [],
  );
  const update = useCallback(
    (id: string, patch: Partial<Pick<Connection, "label" | "baseUrl">>) => connectionManager.update(id, patch),
    [],
  );
  const setPrimary = useCallback((id: string) => connectionManager.setPrimary(id), []);
  const refresh = useCallback(() => connectionManager.refresh(), []);

  const toggleVisible = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeHidden(next);
      return next;
    });
  }, []);

  const isVisible = useCallback((id: string) => !hidden.has(id), [hidden]);

  return {
    connections,
    hubs,
    primaryId,
    hiddenIds: hidden,
    add,
    remove,
    addHub,
    removeHub,
    pairHub,
    revokeHubInstance,
    update,
    setPrimary,
    refresh,
    toggleVisible,
    isVisible,
  };
}
