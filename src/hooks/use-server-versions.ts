import { useEffect, useMemo, useState } from "react";

import { HUB_ROUTES } from "@myra/shared";

import { useConnections } from "@/hooks/use-connections";
import type { Connection } from "@/lib/connections/types";

/** How often to re-probe remote servers for their reported version. */
const PROBE_INTERVAL_MS = 60_000;

/** Per-connection server build version, keyed by connection id (`undefined` = unknown). */
export type ServerVersions = Record<string, string | undefined>;

/** Which connection kinds carry a meaningful, comparable remote server version. */
function tracked(conn: Connection): boolean {
  return conn.kind === "remote" || conn.kind === "hub-instance";
}

async function probeVersion(baseUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${baseUrl}${HUB_ROUTES.health}`, { method: "GET" });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { version?: string };
    return body.version;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the server build version behind each remote / hub-instance connection.
 *
 * - `hub-instance`: the version already rides along on the {@link Connection}
 *   (the hub echoes it from the instance's hello frame), so it's read directly
 *   and stays reactive to presence changes.
 * - `remote`: probed over its unauthenticated `/healthz` (same shape as the hub
 *   probe in {@link useHubStatus}); failures / pre-version servers stay `undefined`.
 *
 * The local sidecar is intentionally skipped — it's always the bundled build.
 */
export function useServerVersions(): ServerVersions {
  const { connections } = useConnections();
  const [remoteProbes, setRemoteProbes] = useState<ServerVersions>({});

  // `${id}@${baseUrl}` per remote — the effect's only dependency, so it re-probes
  // exactly when the remote set changes (not on unrelated connection re-renders).
  const remotesSig = connections
    .filter((c) => c.kind === "remote" && c.baseUrl)
    .map((c) => `${c.id}@${c.baseUrl}`)
    .join("|");

  useEffect(() => {
    const remotes = remotesSig
      ? remotesSig.split("|").map((s) => {
          const at = s.indexOf("@");
          return { id: s.slice(0, at), baseUrl: s.slice(at + 1) };
        })
      : [];
    let cancelled = false;
    const probe = async () => {
      const entries = await Promise.all(remotes.map(async (r) => [r.id, await probeVersion(r.baseUrl)] as const));
      if (!cancelled) setRemoteProbes(Object.fromEntries(entries));
    };
    void probe();
    const id = setInterval(() => void probe(), PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [remotesSig]);

  // Merge: hub-instance versions are derived from the live connection list (so
  // presence updates show immediately); remote versions come from the probe.
  return useMemo(() => {
    const merged: ServerVersions = {};
    for (const conn of connections) {
      if (!tracked(conn)) continue;
      merged[conn.id] = conn.kind === "hub-instance" ? conn.version : remoteProbes[conn.id];
    }
    return merged;
  }, [connections, remoteProbes]);
}
