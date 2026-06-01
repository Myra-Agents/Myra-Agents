import { useCallback, useEffect, useRef, useState } from "react";

import { HUB_ROUTES } from "@myra/shared";

import { useAuth } from "@/hooks/use-auth";
import { useConnections } from "@/hooks/use-connections";
import { hubBaseUrl } from "@/lib/auth/session";

/** The managed cloud hub's connection id (mirrors `CLOUD_HUB_ID` in the manager). */
const CLOUD_HUB_ID = "cloud";
/** How often to re-probe the hub while the page is mounted. */
const PROBE_INTERVAL_MS = 30_000;

/** Liveness of the hub URL, independent of whether the user is signed in. */
export type HubAvailability = "checking" | "online" | "offline";

/**
 * At-a-glance hub health for the Settings indicator. Combines three existing
 * signals — auth (`useAuth`), expanded instance connections (`useConnections`),
 * and an unauthenticated `/healthz` probe — so the UI can answer "is the hub
 * connected and available?" without any new backend coupling.
 */
export function useHubStatus() {
  const { account, isAuthenticated, configured, signIn, signOut, busy } = useAuth();
  const { connections } = useConnections();
  const [availability, setAvailability] = useState<HubAvailability>("checking");
  const probing = useRef(false);

  const instanceCount = connections.filter((c) => c.hubId === CLOUD_HUB_ID && c.status === "connected").length;

  const refresh = useCallback(async () => {
    const base = hubBaseUrl();
    if (!base) {
      setAvailability("offline");
      return;
    }
    if (probing.current) return;
    probing.current = true;
    setAvailability("checking");
    try {
      const res = await fetch(`${base}${HUB_ROUTES.health}`, { method: "GET" });
      setAvailability(res.ok ? "online" : "offline");
    } catch {
      setAvailability("offline");
    } finally {
      probing.current = false;
    }
  }, []);

  // Probe on mount and on a light interval (availability is auth-independent —
  // /healthz is unauthenticated; instance count/auth re-render via their hooks).
  useEffect(() => {
    if (!configured) return;
    void refresh();
    const id = setInterval(() => void refresh(), PROBE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [configured, refresh]);

  return { account, isAuthenticated, configured, availability, instanceCount, refresh, signIn, signOut, busy };
}
