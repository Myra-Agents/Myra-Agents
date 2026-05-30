import { isTauri } from "@tauri-apps/api/core";

import { browserTransport } from "@/lib/transport/browser";
import { tauriTransport } from "@/lib/transport/tauri";
import type { Transport } from "@/lib/transport/types";

import type { Connection, ConnectionEntry } from "./types";

/**
 * Holds the client's backend connections and their transports.
 *
 * Phase 2: exactly one connection — the in-process desktop backend (Tauri) or
 * the offline localStorage stand-in (plain browser). This is the single seam
 * every data/event call flows through. Phase 4 expands it to N connections
 * with fan-out reads / routed mutations / demuxed events; the public shape
 * here is kept aggregation-ready so that change is additive.
 */
class ConnectionManager {
  private entries = new Map<string, ConnectionEntry>();

  constructor() {
    const tauri = isTauri();
    const connection: Connection = {
      id: "local",
      label: tauri ? "This device" : "Browser (offline)",
      baseUrl: "",
      kind: "sidecar",
      status: "connected",
    };
    const transport = tauri ? tauriTransport : browserTransport;
    this.entries.set(connection.id, { connection, transport });
  }

  /** All configured connections (Phase 2: one). */
  list(): Connection[] {
    return [...this.entries.values()].map((e) => e.connection);
  }

  /** Transport for a specific connection; throws if unknown. */
  transport(id: string): Transport {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`[ConnectionManager] unknown connection "${id}"`);
    return entry.transport;
  }

  /** The default connection used by the single-connection seam (Phase 2). */
  primary(): ConnectionEntry {
    const first = this.entries.values().next().value;
    if (!first) throw new Error("[ConnectionManager] no connections configured");
    return first;
  }
}

export const connectionManager = new ConnectionManager();
