import { isTauri } from "@tauri-apps/api/core";

import { browserTransport } from "@/lib/transport/browser";
import { createHttpTransport } from "@/lib/transport/http";
import { tauriTransport } from "@/lib/transport/tauri";
import type { Transport } from "@/lib/transport/types";

import type { Connection, ConnectionEntry } from "./types";

/** Optional server URL baked at build time — points the client at a real Node server. */
const SERVER_URL = process.env.NEXT_PUBLIC_MYRA_SERVER_URL?.trim();

/**
 * Holds the client's backend connections and their transports.
 *
 * Phase 3a: still exactly one connection, but it can now be a real Node server
 * (HTTP transport) when `NEXT_PUBLIC_MYRA_SERVER_URL` is set — otherwise the
 * in-process Tauri backend (desktop) or the offline localStorage stand-in
 * (plain browser). Phase 4 expands this to N connections with fan-out reads /
 * routed mutations / demuxed events; the public shape here is aggregation-ready
 * so that change stays additive.
 */
class ConnectionManager {
  private entries = new Map<string, ConnectionEntry>();

  constructor() {
    const { connection, transport } = this.buildLocal();
    this.entries.set(connection.id, { connection, transport });
  }

  private buildLocal(): ConnectionEntry {
    if (SERVER_URL) {
      return {
        connection: {
          id: "local",
          label: `Server (${SERVER_URL})`,
          baseUrl: SERVER_URL,
          kind: "remote",
          status: "connected",
        },
        transport: createHttpTransport(SERVER_URL),
      };
    }

    const tauri = isTauri();
    return {
      connection: {
        id: "local",
        label: tauri ? "This device" : "Browser (offline)",
        baseUrl: "",
        kind: "sidecar",
        status: "connected",
      },
      transport: tauri ? tauriTransport : browserTransport,
    };
  }

  /** All configured connections (Phase 3: one). */
  list(): Connection[] {
    return [...this.entries.values()].map((e) => e.connection);
  }

  /** Transport for a specific connection; throws if unknown. */
  transport(id: string): Transport {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`[ConnectionManager] unknown connection "${id}"`);
    return entry.transport;
  }

  /** The default connection used by the single-connection seam. */
  primary(): ConnectionEntry {
    const first = this.entries.values().next().value;
    if (!first) throw new Error("[ConnectionManager] no connections configured");
    return first;
  }
}

export const connectionManager = new ConnectionManager();
