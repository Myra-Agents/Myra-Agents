import {
  type Capability,
  type DashboardEventFrame,
  type HubFrame,
  type InstanceInfo,
  PRESENCE_EVENT,
  type RpcResult,
} from "@myra/shared";

/**
 * Transport-agnostic relay core (the "dumb hub").
 *
 * Holds no application data — only live socket maps and pending RPC
 * correlations, partitioned per user. Hosts (the in-memory Node host here, a
 * Cloudflare Durable Object later) adapt their sockets to {@link FrameSink} /
 * {@link DashboardSink} and drive this class; the routing logic stays identical
 * across deployments.
 */

/** A sink for the instance reverse tunnel. */
export interface FrameSink {
  send(frame: HubFrame): void;
  close(): void;
}

/** A sink for a dashboard's multiplexed event stream. */
export interface DashboardSink {
  send(frame: DashboardEventFrame): void;
}

interface InstanceConn {
  instanceId: string;
  label: string;
  capabilities: Capability[];
  sink: FrameSink;
}

interface Pending {
  resolve: (result: RpcResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface UserState {
  instances: Map<string, InstanceConn>;
  dashboards: Set<DashboardSink>;
  pending: Map<string, Pending>;
}

const RPC_TIMEOUT_MS = 30_000;

/** A connection-lifecycle audit record. No payloads — the dumb hub never sees `args`. */
export interface AuditEvent {
  action: "connect" | "disconnect" | "revoke";
  userId: string;
  instanceId: string;
  at: string;
}

export interface HubCoreOptions {
  /** Sink for connection-lifecycle audit records. Defaults to a `[audit]` console line. */
  onAudit?: (e: AuditEvent) => void;
}

export class HubCore {
  private users = new Map<string, UserState>();
  private onAudit: (e: AuditEvent) => void;

  constructor(opts: HubCoreOptions = {}) {
    this.onAudit =
      opts.onAudit ??
      ((e) => console.log(`[audit] ${e.action} user=${e.userId} instance=${e.instanceId} at=${e.at}`));
  }

  private audit(action: AuditEvent["action"], userId: string, instanceId: string): void {
    try {
      this.onAudit({ action, userId, instanceId, at: new Date().toISOString() });
    } catch {
      // auditing must never break routing.
    }
  }

  private user(userId: string): UserState {
    let state = this.users.get(userId);
    if (!state) {
      state = { instances: new Map(), dashboards: new Set(), pending: new Map() };
      this.users.set(userId, state);
    }
    return state;
  }

  // --- instance side --------------------------------------------------------

  /** Register (or replace) an instance's reverse tunnel for a user. */
  addInstance(userId: string, conn: InstanceConn): void {
    const state = this.user(userId);
    const existing = state.instances.get(conn.instanceId);
    if (existing && existing.sink !== conn.sink) existing.sink.close(); // supersede a stale socket
    state.instances.set(conn.instanceId, conn);
    this.audit("connect", userId, conn.instanceId);
    this.broadcastPresence(userId, conn.instanceId, true);
  }

  /** Drop an instance; only if the current socket matches (ignore late closes of a superseded one). */
  removeInstance(userId: string, instanceId: string, sink?: FrameSink): void {
    const state = this.users.get(userId);
    if (!state) return;
    const conn = state.instances.get(instanceId);
    if (conn && (!sink || conn.sink === sink)) {
      state.instances.delete(instanceId);
      this.audit("disconnect", userId, instanceId);
      this.broadcastPresence(userId, instanceId, false);
    }
  }

  /** Forcibly close and drop an instance's tunnel — used when its credential is revoked. */
  closeInstance(userId: string, instanceId: string): void {
    const state = this.users.get(userId);
    const conn = state?.instances.get(instanceId);
    if (!conn) return;
    state?.instances.delete(instanceId);
    this.audit("revoke", userId, instanceId);
    this.broadcastPresence(userId, instanceId, false);
    try {
      conn.sink.close();
    } catch {
      // already gone.
    }
  }

  /** Tell the user's dashboards an instance's presence flipped, so they refresh topology. */
  private broadcastPresence(userId: string, instanceId: string, online: boolean): void {
    const state = this.users.get(userId);
    if (!state) return;
    const frame: DashboardEventFrame = { instanceId, event: PRESENCE_EVENT, payload: { online } };
    for (const dash of state.dashboards) {
      try {
        dash.send(frame);
      } catch {
        // a broken dashboard sink must not stop the others.
      }
    }
  }

  /** Handle a frame arriving from an instance tunnel: rpc-result correlation + event fan-out. */
  handleInstanceFrame(userId: string, instanceId: string, frame: HubFrame): void {
    const state = this.users.get(userId);
    if (!state) return;
    if (frame.type === "rpc-result") {
      const pending = state.pending.get(frame.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      state.pending.delete(frame.id);
      pending.resolve(frame.ok ? { ok: true, data: frame.data } : { ok: false, error: frame.error ?? "unknown error" });
      return;
    }
    if (frame.type === "event") {
      const out: DashboardEventFrame = { instanceId, event: frame.event, payload: frame.payload };
      for (const dash of state.dashboards) {
        try {
          dash.send(out);
        } catch {
          // A broken dashboard sink must not stop the others.
        }
      }
    }
  }

  // --- dashboard side -------------------------------------------------------

  /** The user's currently online instances. */
  listInstances(userId: string): InstanceInfo[] {
    const state = this.users.get(userId);
    if (!state) return [];
    return [...state.instances.values()].map((c) => ({
      instanceId: c.instanceId,
      label: c.label,
      capabilities: c.capabilities,
      status: "online" as const,
    }));
  }

  /** Forward a command to an instance and await its reply (or a timeout). */
  rpc(userId: string, instanceId: string, cmd: string, args?: Record<string, unknown>): Promise<RpcResult> {
    const state = this.user(userId);
    const conn = state.instances.get(instanceId);
    if (!conn) return Promise.resolve({ ok: false, error: `instance "${instanceId}" not connected` });

    const id = crypto.randomUUID();
    return new Promise<RpcResult>((resolve) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        resolve({ ok: false, error: `rpc "${cmd}" timed out` });
      }, RPC_TIMEOUT_MS);
      state.pending.set(id, { resolve, timer });
      try {
        conn.sink.send({ type: "rpc", id, cmd, args });
      } catch (err) {
        clearTimeout(timer);
        state.pending.delete(id);
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  /** Subscribe a dashboard to the user's multiplexed event stream. Returns an unsubscribe. */
  addDashboard(userId: string, sink: DashboardSink): () => void {
    const state = this.user(userId);
    state.dashboards.add(sink);
    return () => {
      state.dashboards.delete(sink);
    };
  }
}
