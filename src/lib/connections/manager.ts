import { isTauri } from "@tauri-apps/api/core";

import { browserTransport } from "@/lib/transport/browser";
import { createHttpTransport } from "@/lib/transport/http";
import { tauriTransport } from "@/lib/transport/tauri";
import type { Transport, UnlistenFn } from "@/lib/transport/types";

import type { Connection, ConnectionEntry, ConnectionStatus } from "./types";

/** Optional server URL baked at build time — seeds the local connection at a real Node server. */
const SERVER_URL = process.env.NEXT_PUBLIC_MYRA_SERVER_URL?.trim();

/** localStorage key holding the persisted connection registry (web/mobile + Tauri webview). */
const STORAGE_KEY = "myra.connections";

const LOCAL_ID = "local";

interface PersistedRegistry {
  connections: Connection[];
  primaryId: string;
}

/** A fan-out result: one entry per queried connection, success or failure. */
export interface FanResult<T> {
  connId: string;
  data?: T;
  error?: Error;
}

/** Callback for the demuxed multi-connection event stream. */
export type DemuxHandler<T> = (e: { connId: string; payload: T }) => void;

/**
 * Holds the client's backend connections and routes commands/events across them.
 *
 * Phase 4: N connections at once, merged into one board. Reads fan out
 * (`invokeAll`), mutations route to the owning server (`invokeOne`), and live
 * events are demuxed by connection (`listenAll`). Each connection's id
 * namespaces its entities into GlobalIds upstream in the aggregation layer.
 *
 * The registry persists to localStorage so it survives reloads in the browser
 * and the Tauri webview alike (the desktop sidecar supervisor reads
 * `connections.json` separately in Phase 5). A failing connection degrades
 * gracefully — its `status` flips and the UI drops its cards while the others
 * stay live.
 */
class ConnectionManager {
  private entries = new Map<string, ConnectionEntry>();
  private primaryConnId = LOCAL_ID;
  private topologyListeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();

  constructor() {
    this.loadRegistry();
  }

  // --- registry persistence -------------------------------------------------

  private loadRegistry(): void {
    const persisted = this.readStorage();
    if (persisted && persisted.connections.length > 0) {
      for (const conn of persisted.connections) {
        this.entries.set(conn.id, { connection: conn, transport: this.buildTransport(conn) });
      }
      this.primaryConnId = this.entries.has(persisted.primaryId)
        ? persisted.primaryId
        : (this.entries.keys().next().value ?? LOCAL_ID);
      return;
    }

    const local = this.defaultLocal();
    this.entries.set(local.id, { connection: local, transport: this.buildTransport(local) });
    this.primaryConnId = local.id;
  }

  private readStorage(): PersistedRegistry | undefined {
    if (typeof localStorage === "undefined") return undefined;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as PersistedRegistry;
      if (!Array.isArray(parsed.connections)) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private persist(): void {
    if (typeof localStorage === "undefined") return;
    const payload: PersistedRegistry = {
      connections: this.list(),
      primaryId: this.primaryConnId,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // storage full / unavailable — registry stays in-memory for this session.
    }
  }

  /** The auto-seeded local connection: a real server (env), the desktop, or offline browser. */
  private defaultLocal(): Connection {
    if (SERVER_URL) {
      return {
        id: LOCAL_ID,
        label: `Server (${SERVER_URL})`,
        baseUrl: SERVER_URL,
        kind: "remote",
        status: "connected",
      };
    }
    const tauri = isTauri();
    return {
      id: LOCAL_ID,
      label: tauri ? "This device" : "Browser (offline)",
      baseUrl: "",
      kind: "sidecar",
      status: "connected",
    };
  }

  /** Pick the transport for a connection from its baseUrl/runtime. */
  private buildTransport(conn: Connection): Transport {
    if (conn.baseUrl) return createHttpTransport(conn.baseUrl);
    return isTauri() ? tauriTransport : browserTransport;
  }

  // --- topology -------------------------------------------------------------

  /** All configured connections. */
  list(): Connection[] {
    return [...this.entries.values()].map((e) => e.connection);
  }

  get(id: string): Connection | undefined {
    return this.entries.get(id)?.connection;
  }

  /** Transport for a specific connection; throws if unknown. */
  transport(id: string): Transport {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`[ConnectionManager] unknown connection "${id}"`);
    return entry.transport;
  }

  primaryId(): string {
    return this.primaryConnId;
  }

  /** The default connection used by the legacy single-connection seam + as add-card target. */
  primary(): ConnectionEntry {
    const entry = this.entries.get(this.primaryConnId) ?? this.entries.values().next().value;
    if (!entry) throw new Error("[ConnectionManager] no connections configured");
    return entry;
  }

  setPrimary(id: string): void {
    if (!this.entries.has(id) || id === this.primaryConnId) return;
    this.primaryConnId = id;
    this.persist();
    this.emitTopology();
  }

  /** Register a new remote connection. Returns the created connection. */
  add(input: { label: string; baseUrl: string }): Connection {
    const id = crypto.randomUUID();
    const conn: Connection = {
      id,
      label: input.label.trim() || input.baseUrl,
      baseUrl: input.baseUrl.replace(/\/$/, ""),
      kind: "remote",
      status: "connecting",
    };
    this.entries.set(id, { connection: conn, transport: this.buildTransport(conn) });
    this.persist();
    this.emitTopology();
    return conn;
  }

  remove(id: string): void {
    if (id === LOCAL_ID) return; // the local connection is permanent
    if (!this.entries.delete(id)) return;
    if (this.primaryConnId === id) {
      this.primaryConnId = this.entries.keys().next().value ?? LOCAL_ID;
    }
    this.persist();
    this.emitTopology();
  }

  /** Patch a connection's label/baseUrl; rebuilds the transport if the URL changed. */
  update(id: string, patch: Partial<Pick<Connection, "label" | "baseUrl">>): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const next: Connection = { ...entry.connection };
    if (patch.label !== undefined) next.label = patch.label;
    let rebuild = false;
    if (patch.baseUrl !== undefined) {
      const url = patch.baseUrl.replace(/\/$/, "");
      rebuild = url !== entry.connection.baseUrl;
      next.baseUrl = url;
      if (rebuild) next.status = "connecting";
    }
    this.entries.set(id, {
      connection: next,
      transport: rebuild ? this.buildTransport(next) : entry.transport,
    });
    this.persist();
    this.emitTopology();
  }

  private setStatus(id: string, status: ConnectionStatus): void {
    const entry = this.entries.get(id);
    if (!entry || entry.connection.status === status) return;
    this.entries.set(id, { ...entry, connection: { ...entry.connection, status } });
    this.emitStatus();
  }

  // --- subscriptions --------------------------------------------------------

  /** Fired when connections are added/removed/relabelled or the primary changes — consumers re-fan-out. */
  onTopologyChange(cb: () => void): () => void {
    this.topologyListeners.add(cb);
    return () => this.topologyListeners.delete(cb);
  }

  /** Fired when a connection's runtime status flips — for status badges, no reload needed. */
  onStatusChange(cb: () => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private emitTopology(): void {
    for (const cb of this.topologyListeners) cb();
  }

  private emitStatus(): void {
    for (const cb of this.statusListeners) cb();
  }

  // --- aggregation ----------------------------------------------------------

  /** The connections reads/events fan out across (everything not disabled). */
  private activeConnections(): Connection[] {
    return this.list().filter((c) => c.status !== "disabled");
  }

  /** Route a single command to one connection. */
  invokeOne<T>(connId: string, cmd: string, args?: Record<string, unknown>): Promise<T> {
    return this.transport(connId).invoke<T>(cmd, args);
  }

  /** Fan a read out to every active connection; never rejects — failures land per-entry. */
  async invokeAll<T>(cmd: string, args?: Record<string, unknown>): Promise<FanResult<T>[]> {
    const conns = this.activeConnections();
    const results = await Promise.all(
      conns.map(async (conn): Promise<FanResult<T>> => {
        try {
          const data = await this.transport(conn.id).invoke<T>(cmd, args);
          this.setStatus(conn.id, "connected");
          return { connId: conn.id, data };
        } catch (e) {
          this.setStatus(conn.id, "error");
          return { connId: conn.id, error: e instanceof Error ? e : new Error(String(e)) };
        }
      }),
    );
    return results;
  }

  /**
   * Subscribe to an event across every active connection, demuxed by connId.
   * Returns one unlisten that tears down all underlying subscriptions. Callers
   * re-subscribe on topology change to pick up added/removed connections.
   */
  async listenAll<T>(event: string, cb: DemuxHandler<T>): Promise<UnlistenFn> {
    const conns = this.activeConnections();
    const unlistens = await Promise.all(
      conns.map((conn) =>
        this.transport(conn.id)
          .listen<T>(event, (e) => cb({ connId: conn.id, payload: e.payload }))
          .catch((err): UnlistenFn => {
            console.error(`[ConnectionManager] listen "${event}" on "${conn.id}" failed:`, err);
            return () => undefined;
          }),
      ),
    );
    return () => {
      for (const un of unlistens) un();
    };
  }
}

export const connectionManager = new ConnectionManager();
