import { isTauri, invoke as tauriInvoke } from "@tauri-apps/api/core";

import { parseGlobalId } from "@/lib/aggregate/global-id";
import {
  getAccount,
  getValidSessionToken,
  isAuthConfigured,
  isAuthenticated,
  refresh as refreshSession,
  subscribe as subscribeAuth,
} from "@/lib/auth/session";
import { browserTransport } from "@/lib/transport/browser";
import { createHttpTransport } from "@/lib/transport/http";
import { createHubClient, type HubClient } from "@/lib/transport/hub";
import { tauriTransport } from "@/lib/transport/tauri";
import type { Transport, UnlistenFn } from "@/lib/transport/types";

import type { Connection, ConnectionEntry, ConnectionStatus, HubRegistration } from "./types";

/** The managed cloud hub's fixed id — its auth is owned by `lib/auth/session`. */
const CLOUD_HUB_ID = "cloud";
const CLOUD_HUB_URL = process.env.NEXT_PUBLIC_MYRA_HUB_URL?.replace(/\/$/, "") || "";

/** Optional server URL baked at build time — seeds the local connection at a real Node server. */
const SERVER_URL = process.env.NEXT_PUBLIC_MYRA_SERVER_URL?.trim();

/** localStorage key holding the persisted connection registry (web/mobile + Tauri webview). */
const STORAGE_KEY = "myra.connections";

const LOCAL_ID = "local";

interface PersistedRegistry {
  connections: Connection[];
  primaryId: string;
  hubs?: HubRegistration[];
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
  private hubs = new Map<string, { reg: HubRegistration; client: HubClient; offPresence?: () => void }>();
  private primaryConnId = LOCAL_ID;
  private topologyListeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();
  private sidecarReady?: Promise<void>;
  private hubsReady?: Promise<void>;
  /** GlobalIds of cards with an open modal — pushed to backends as `set_log_watch`. */
  private watchedGlobalIds = new Set<string>();

  constructor() {
    this.loadRegistry();
    // The cloud hub is derived from auth state, never persisted — sync it now
    // and whenever the session changes (login / logout / refresh).
    this.syncCloudHub();
    subscribeAuth(() => this.syncCloudHub());
  }

  // --- registry persistence -------------------------------------------------

  private loadRegistry(): void {
    const persisted = this.readStorage();
    if (persisted && persisted.connections.length > 0) {
      for (const conn of persisted.connections) {
        if (conn.kind === "hub-instance") continue; // rebuilt from hubs in ensureHubs
        this.entries.set(conn.id, { connection: conn, transport: this.buildTransport(conn) });
      }
      for (const reg of persisted.hubs ?? []) {
        if (reg.id === CLOUD_HUB_ID) continue; // re-derived from auth, not persisted
        this.hubs.set(reg.id, { reg, client: createHubClient(reg.baseUrl, reg.token) });
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
      connections: this.list().filter((c) => c.kind !== "hub-instance"), // hub-instances are rebuilt from hubs
      primaryId: this.primaryConnId,
      // The cloud hub is derived from auth state (syncCloudHub), never persisted.
      hubs: [...this.hubs.values()].map((h) => h.reg).filter((reg) => reg.id !== CLOUD_HUB_ID),
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
    if (conn.baseUrl) return createHttpTransport(conn.baseUrl, conn.auth?.token);
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
    if (this.entries.get(id)?.connection.kind === "hub-instance") return; // managed by its hub; use removeHub
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
    // Re-assert the live-log watch set so connections added since the last
    // setLogWatch start out gated too.
    void this.pushLogWatch();
  }

  private emitStatus(): void {
    for (const cb of this.statusListeners) cb();
  }

  // --- desktop sidecar ------------------------------------------------------

  /**
   * On the desktop, the local connection is backed by a Node sidecar Tauri
   * spawns on a fresh port each launch. Resolve that port and re-point the
   * local connection at `http://127.0.0.1:<port>` over HTTP. Memoized so it
   * runs once; consumers `await ensureSidecar()` before the first fan-out.
   *
   * No-op when a build-time server URL is set (local already points at a real
   * server) or in a plain browser (the offline transport stays in place).
   */
  ensureSidecar(): Promise<void> {
    if (!this.sidecarReady) this.sidecarReady = this.initLocalSidecar();
    return this.sidecarReady;
  }

  private async initLocalSidecar(): Promise<void> {
    if (SERVER_URL || !isTauri()) return;
    try {
      const port = await tauriInvoke<number>("get_sidecar_port");
      this.pointLocalAtPort(port, await this.localToken());
    } catch (e) {
      console.error("[ConnectionManager] sidecar init failed:", e);
    }
  }

  /**
   * The localhost bearer the desktop backend gates `/rpc` + `/events` with (kept
   * in the OS keychain). `undefined` when running ungated (no keychain backend).
   */
  private async localToken(): Promise<string | undefined> {
    try {
      return (await tauriInvoke<string | null>("get_local_server_token")) ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** Re-point the LOCAL connection at `http://127.0.0.1:<port>` and rebuild its transport. */
  private pointLocalAtPort(port: number, token?: string): void {
    const entry = this.entries.get(LOCAL_ID);
    if (!entry) return;
    const baseUrl = `http://127.0.0.1:${port}`;
    // Always override any persisted (stale) port/token — they change per launch.
    const connection: Connection = {
      ...entry.connection,
      baseUrl,
      kind: "sidecar",
      status: "connecting",
      auth: token ? { token } : undefined,
    };
    this.entries.set(LOCAL_ID, { connection, transport: createHttpTransport(baseUrl, token) });
    this.persist();
    this.emitTopology();
  }

  /**
   * Re-resolve the desktop local backend after remote access is enabled/disabled.
   * Tauri kills any ephemeral child and either adopts the persistent service on
   * its stable port or re-spawns; we re-point LOCAL at whatever port it returns.
   * No-op off the desktop / with a build-time server URL.
   */
  async refreshLocal(): Promise<void> {
    if (SERVER_URL || !isTauri()) return;
    try {
      const port = await tauriInvoke<number>("refresh_local_backend");
      this.pointLocalAtPort(port, await this.localToken());
    } catch (e) {
      console.error("[ConnectionManager] refreshLocal failed:", e);
    }
  }

  // --- hubs -----------------------------------------------------------------

  /**
   * Reconcile the managed cloud hub with the auth session: add it (with a
   * dynamic-token client that refreshes on 401) when signed in, drop it when
   * signed out. Never persisted — auth is the single source of truth.
   */
  private syncCloudHub(): void {
    const shouldHave = CLOUD_HUB_URL.length > 0 && isAuthConfigured() && isAuthenticated();
    const has = this.hubs.has(CLOUD_HUB_ID);
    if (shouldHave && !has) {
      const reg: HubRegistration = {
        id: CLOUD_HUB_ID,
        label: getAccount()?.email ?? "Myra Cloud",
        baseUrl: CLOUD_HUB_URL,
        token: "",
      };
      const client = createHubClient(CLOUD_HUB_URL, {
        getToken: () => getValidSessionToken(),
        onUnauthorized: () => refreshSession(),
      });
      this.hubs.set(CLOUD_HUB_ID, { reg, client });
      this.hubsReady = undefined; // force re-expand on the next fan-out
      this.expandHub(CLOUD_HUB_ID)
        .then(() => this.emitTopology())
        .catch((e) => console.error("[ConnectionManager] cloud hub expand failed:", e));
    } else if (!shouldHave && has) {
      this.removeHub(CLOUD_HUB_ID);
    }
  }

  /** Registered hubs (one URL+token that expands into N instance connections). */
  listHubs(): HubRegistration[] {
    return [...this.hubs.values()].map((h) => h.reg);
  }

  /** Register a hub; its instances appear as `hub-instance` connections after expansion. */
  addHub(input: { label: string; baseUrl: string; token: string }): HubRegistration {
    const id = crypto.randomUUID();
    const reg: HubRegistration = {
      id,
      label: input.label.trim() || input.baseUrl,
      baseUrl: input.baseUrl.replace(/\/$/, ""),
      token: input.token,
    };
    this.hubs.set(id, { reg, client: createHubClient(reg.baseUrl, reg.token) });
    this.persist();
    this.expandHub(id)
      .then(() => this.emitTopology())
      .catch((e) => console.error("[ConnectionManager] addHub expand failed:", e));
    return reg;
  }

  /** Remove a hub and all of its instance connections. */
  removeHub(hubId: string): void {
    const entry = this.hubs.get(hubId);
    if (!entry) return;
    entry.offPresence?.();
    entry.client.close();
    this.hubs.delete(hubId);
    for (const id of [...this.entries.keys()]) {
      if (this.entries.get(id)?.connection.hubId === hubId) this.entries.delete(id);
    }
    this.persist();
    this.emitTopology();
  }

  /** Mint a one-time pairing code on a hub, for enrolling a new instance. */
  async pairHub(hubId: string): Promise<{ code: string; expiresAt: number }> {
    const entry = this.hubs.get(hubId);
    if (!entry) throw new Error(`unknown hub "${hubId}"`);
    return entry.client.pair();
  }

  /** Revoke one instance on a hub, then re-expand so its connection drops. */
  async revokeHubInstance(hubId: string, instanceId: string): Promise<void> {
    const entry = this.hubs.get(hubId);
    if (!entry) throw new Error(`unknown hub "${hubId}"`);
    await entry.client.revoke(instanceId);
    await this.expandHub(hubId);
    this.emitTopology();
  }

  /** Resolve all registered hubs into their instance connections; memoized like the sidecar. */
  ensureHubs(): Promise<void> {
    if (!this.hubsReady)
      this.hubsReady = Promise.all([...this.hubs.keys()].map((id) => this.expandHub(id))).then(() => undefined);
    return this.hubsReady;
  }

  /** List one hub's online instances and reconcile them into the entries map. */
  private async expandHub(hubId: string): Promise<void> {
    const entry = this.hubs.get(hubId);
    if (!entry) return;
    const { reg, client } = entry;

    let instances: Awaited<ReturnType<HubClient["listInstances"]>>;
    try {
      instances = await client.listInstances();
    } catch (e) {
      console.error(`[ConnectionManager] hub "${reg.label}" list failed:`, e);
      this.pruneHubEntries(hubId, new Set());
      return;
    }

    const seen = new Set<string>();
    for (const inst of instances) {
      const connId = `${hubId}:${inst.instanceId}`;
      seen.add(connId);
      const connection: Connection = {
        id: connId,
        label: `${reg.label} · ${inst.label}`,
        baseUrl: reg.baseUrl,
        kind: "hub-instance",
        status: "connected",
        hubId,
        instanceId: inst.instanceId,
        version: inst.version,
      };
      this.entries.set(connId, { connection, transport: client.transportFor(inst.instanceId) });
    }
    this.pruneHubEntries(hubId, seen);

    // Re-expand whenever an instance connects/disconnects on this hub.
    if (!entry.offPresence) {
      entry.offPresence = client.onPresence(() => {
        this.expandHub(hubId)
          .then(() => this.emitTopology())
          .catch(() => undefined);
      });
    }
  }

  /** Drop this hub's instance connections that aren't in `keep`. */
  private pruneHubEntries(hubId: string, keep: Set<string>): void {
    for (const id of [...this.entries.keys()]) {
      const conn = this.entries.get(id)?.connection;
      if (conn?.hubId === hubId && !keep.has(id)) this.entries.delete(id);
    }
  }

  // --- aggregation ----------------------------------------------------------

  /** Everything the reads/events should wait on before fanning out. */
  private ready(): Promise<unknown> {
    return Promise.all([this.ensureSidecar(), this.ensureHubs()]);
  }

  /** The connections reads/events fan out across (everything not disabled). */
  private activeConnections(): Connection[] {
    return this.list().filter((c) => c.status !== "disabled");
  }

  /** Route a single command to one connection. */
  async invokeOne<T>(connId: string, cmd: string, args?: Record<string, unknown>): Promise<T> {
    await this.ready();
    return this.transport(connId).invoke<T>(cmd, args);
  }

  /**
   * Adaptive log cadence (P6). Tell each connection which of its cards has a
   * live viewer (an open modal) so headless/scheduled runs elsewhere stop
   * streaming live log frames — the full log stays fetchable via `get_run_log`.
   * Every active connection is addressed (empty set included) so gating is on by
   * default once the board is open. Best-effort: a backend that doesn't know
   * `set_log_watch` (browser offline) just ignores it.
   */
  async setLogWatch(globalIds: string[]): Promise<void> {
    this.watchedGlobalIds = new Set(globalIds);
    await this.pushLogWatch();
  }

  private async pushLogWatch(): Promise<void> {
    await this.ready();
    const byConn = new Map<string, string[]>();
    for (const conn of this.activeConnections()) byConn.set(conn.id, []);
    for (const gid of this.watchedGlobalIds) {
      const { connId, entityId } = parseGlobalId(gid);
      byConn.get(connId)?.push(entityId);
    }
    await Promise.all(
      [...byConn].map(([connId, cardIds]) =>
        this.transport(connId)
          .invoke("set_log_watch", { cardIds })
          .catch(() => undefined),
      ),
    );
  }

  /** Fan a read out to every active connection; never rejects — failures land per-entry. */
  async invokeAll<T>(cmd: string, args?: Record<string, unknown>): Promise<FanResult<T>[]> {
    await this.ready();
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
    await this.ready();
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
