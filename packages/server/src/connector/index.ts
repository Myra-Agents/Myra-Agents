import type { Capability, HubFrame, Store } from "@myra/shared";

import type { EventBus } from "../realtime/bus";
import type { AgentRunner } from "../runner/agent-runner";
import { dispatchCommand } from "../runner/dispatch-all";

/**
 * The hub connector — the instance side of the centralized relay.
 *
 * When `MYRA_HUB_URL` is set the server, in addition to (or instead of) serving
 * its own HTTP port, dials *out* to the hub over a persistent WebSocket and
 * registers. The hub forwards dashboard commands as `rpc` frames, which the
 * connector runs through the same {@link dispatchCommand} the HTTP route uses,
 * replying with `rpc-result`. Local {@link EventBus} emissions are pushed up as
 * `event` frames. Heartbeat keeps NAT/middleboxes from idle-killing the socket;
 * the connection reconnects with jittered backoff.
 *
 * Outbound-only: the instance never accepts an inbound connection, so it works
 * behind NAT and corporate firewalls (see `docs/centralized-hub-plan.md` §9).
 */
export interface ConnectorOptions {
  hubUrl: string;
  token: string;
  instanceId: string;
  label: string;
  capabilities: Capability[];
  store: Store;
  runner: AgentRunner;
  bus: EventBus;
}

export interface ConnectorHandle {
  stop(): void;
}

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 10_000;

export function startConnector(opts: ConnectorOptions): ConnectorHandle {
  let socket: WebSocket | undefined;
  let stopped = false;
  let backoff = 500;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeBus: (() => void) | undefined;

  function send(frame: HubFrame): void {
    try {
      socket?.send(JSON.stringify(frame));
    } catch {
      // Socket gone mid-send; onclose drives the reconnect.
    }
  }

  function teardownLive(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = undefined;
    }
    if (unsubscribeBus) {
      unsubscribeBus();
      unsubscribeBus = undefined;
    }
  }

  function connect(): void {
    // The credential's hubUrl is the http(s) base; the tunnel is ws(s).
    const wsBase = opts.hubUrl.replace(/\/$/, "").replace(/^http/, "ws");
    const url = `${wsBase}/agent/connect?token=${encodeURIComponent(opts.token)}`;
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      backoff = 500;
      send({
        type: "hello",
        instanceId: opts.instanceId,
        label: opts.label,
        capabilities: opts.capabilities,
      });
      pingTimer = setInterval(() => send({ type: "ping" }), PING_MS);
      unsubscribeBus = opts.bus.subscribe((f) => send({ type: "event", event: f.event, payload: f.payload }));
      console.log(`[connector] registered "${opts.instanceId}" at ${opts.hubUrl}`);
    };

    ws.onmessage = async (ev: MessageEvent) => {
      const frame = parseFrame(ev.data);
      if (!frame) return;
      if (frame.type === "rpc") {
        try {
          const data = await dispatchCommand(opts.store, opts.runner, frame.cmd, frame.args);
          send({ type: "rpc-result", id: frame.id, ok: true, data });
        } catch (err) {
          send({
            type: "rpc-result",
            id: frame.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      if (frame.type === "ping") send({ type: "pong" });
    };

    ws.onclose = (ev: CloseEvent) => {
      teardownLive();
      socket = undefined;
      // 1008 = policy violation: the hub rejected our credential (revoked /
      // expired / invalid). Retrying can't help — stop and require re-enrollment.
      if (ev.code === 1008) {
        stopped = true;
        console.warn(
          `[connector] hub rejected credential for "${opts.instanceId}" — re-enroll with: bun run enroll <code>`,
        );
        return;
      }
      if (!stopped) scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // onclose drives the reconnect.
      }
    };
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    const delay = backoff * (0.5 + Math.random()); // jitter to avoid reconnect storms
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      connect();
    }, delay);
  }

  connect();

  return {
    stop() {
      stopped = true;
      teardownLive();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      try {
        socket?.close();
      } catch {
        // already closing.
      }
    },
  };
}

function parseFrame(data: unknown): HubFrame | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as HubFrame;
  } catch {
    return null;
  }
}
