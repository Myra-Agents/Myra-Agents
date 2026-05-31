import {
  type DashboardEventFrame,
  HUB_ROUTES,
  type InstanceInfo,
  type PairingCode,
  PRESENCE_EVENT,
  type RpcResult,
} from "@myra/shared";

import type { Transport, UnlistenFn } from "./types";

/**
 * Hub client — one per registered hub. Unlike {@link createHttpTransport} (one
 * transport = one server), a hub fronts *many* instances, so this exposes:
 *  - `listInstances()` — which of the user's instances are online.
 *  - `transportFor(instanceId)` — a {@link Transport} bound to one instance, so
 *    each hub-instance plugs into the existing ConnectionManager unchanged.
 *  - `onPresence()` — fires when any instance connects/disconnects, so the
 *    manager can re-expand the hub's connections.
 *
 * RPC goes to `POST /api/i/:instanceId/rpc/:cmd` (same `{ok,data}` envelope as a
 * direct server). One shared WebSocket to `/api/events` carries every instance's
 * push frames, demuxed here by `instanceId` + event name. The session token
 * authenticates both (Bearer on REST, `?token=` on the WS).
 */
type Handler = (event: { payload: unknown }) => void;

export interface HubClient {
  listInstances(): Promise<InstanceInfo[]>;
  transportFor(instanceId: string): Transport;
  onPresence(cb: () => void): () => void;
  /** Mint a one-time pairing code to enroll a new instance against this hub. */
  pair(): Promise<PairingCode>;
  /** Revoke an instance's credential and drop its live tunnel. */
  revoke(instanceId: string): Promise<void>;
  close(): void;
}

/** Dev-login helper: exchange a userId for a session token (real deploys use OIDC). */
export async function hubLogin(baseUrl: string, userId: string): Promise<string> {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    data?: { token: string };
    error?: string;
  } | null;
  if (!body?.ok || !body.data) throw new Error(body?.error ?? `login failed (${res.status})`);
  return body.data.token;
}

export function createHubClient(baseUrl: string, token: string): HubClient {
  const root = baseUrl.replace(/\/$/, "");
  const wsUrl = `${root.replace(/^http/, "ws")}${HUB_ROUTES.events}?token=${encodeURIComponent(token)}`;
  const authHeaders = { authorization: `Bearer ${token}` };

  // keyed `${instanceId}::${event}` → handlers
  const handlers = new Map<string, Set<Handler>>();
  const presenceCbs = new Set<() => void>();

  let socket: WebSocket | undefined;
  let backoff = 500;
  const MAX_BACKOFF = 10_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function key(instanceId: string, event: string): string {
    return `${instanceId}::${event}`;
  }

  function dispatch(raw: string): void {
    let frame: DashboardEventFrame;
    try {
      frame = JSON.parse(raw) as DashboardEventFrame;
    } catch {
      return;
    }
    if (frame.event === PRESENCE_EVENT) {
      for (const cb of presenceCbs) cb();
      return;
    }
    const set = handlers.get(key(frame.instanceId, frame.event));
    if (!set) return;
    for (const handler of set) handler({ payload: frame.payload });
  }

  function wantSocket(): boolean {
    return !closed && (handlers.size > 0 || presenceCbs.size > 0);
  }

  function openSocket(): void {
    if (socket || !wantSocket() || typeof WebSocket === "undefined") return;
    const ws = new WebSocket(wsUrl);
    socket = ws;
    ws.onopen = () => {
      backoff = 500;
    };
    ws.onmessage = (ev) => dispatch(typeof ev.data === "string" ? ev.data : "");
    ws.onclose = () => {
      socket = undefined;
      scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // onclose drives reconnect.
      }
    };
  }

  function scheduleReconnect(): void {
    if (reconnectTimer || !wantSocket()) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      openSocket();
    }, backoff);
  }

  async function rpc(instanceId: string, cmd: string, args?: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${root}${HUB_ROUTES.rpc(instanceId, cmd)}`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify(args ?? {}),
    });
    let body: RpcResult;
    try {
      body = (await res.json()) as RpcResult;
    } catch {
      throw new Error(`[hub] ${cmd}: ${res.status} ${res.statusText} (non-JSON response)`);
    }
    if (!body.ok) throw new Error(`[hub] ${cmd}: ${body.error}`);
    return body.data;
  }

  return {
    async listInstances() {
      const res = await fetch(`${root}${HUB_ROUTES.instances}`, { headers: authHeaders });
      const body = (await res.json()) as { ok: boolean; data?: InstanceInfo[]; error?: string };
      if (!body.ok) throw new Error(body.error ?? "listInstances failed");
      return body.data ?? [];
    },

    transportFor(instanceId: string): Transport {
      return {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => rpc(instanceId, cmd, args) as Promise<T>,
        listen: <T>(event: string, handler: (e: { payload: T }) => void): Promise<UnlistenFn> => {
          const typed = handler as Handler;
          const k = key(instanceId, event);
          let set = handlers.get(k);
          if (!set) {
            set = new Set();
            handlers.set(k, set);
          }
          set.add(typed);
          openSocket();
          return Promise.resolve(() => {
            const current = handlers.get(k);
            if (current) {
              current.delete(typed);
              if (current.size === 0) handlers.delete(k);
            }
          });
        },
      };
    },

    onPresence(cb: () => void): () => void {
      presenceCbs.add(cb);
      openSocket();
      return () => presenceCbs.delete(cb);
    },

    async pair() {
      const res = await fetch(`${root}${HUB_ROUTES.pair}`, { method: "POST", headers: authHeaders });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: PairingCode; error?: string } | null;
      if (!body?.ok || !body.data) throw new Error(body?.error ?? `pair failed (${res.status})`);
      return body.data;
    },

    async revoke(instanceId: string) {
      const res = await fetch(`${root}${HUB_ROUTES.revoke(instanceId)}`, { method: "POST", headers: authHeaders });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!body?.ok) throw new Error(body?.error ?? `revoke failed (${res.status})`);
    },

    close() {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      try {
        socket?.close();
      } catch {
        // already closing.
      }
      socket = undefined;
      handlers.clear();
      presenceCbs.clear();
    },
  };
}
