/**
 * The hub wire contract — the single source of truth for frames exchanged
 * across the centralized relay (see `docs/centralized-hub-plan.md`).
 *
 * Two channels meet at the hub:
 *  - Instance ↔ hub: a persistent reverse tunnel carrying {@link HubFrame}s.
 *  - Dashboard ↔ hub: REST RPC + a multiplexed event stream of
 *    {@link DashboardEventFrame}s (each tagged with the originating instance).
 *
 * The relay is a "dumb hub": it authenticates, tracks presence, and forwards
 * frames. It never interprets `cmd`/`args`/`payload` — those round-trip the
 * existing command contract untouched.
 */

/** What an instance can do; gates which commands the hub will route to it. */
export type Capability = "agent" | "os";

/** A connected instance as advertised to the dashboard. */
export interface InstanceInfo {
  instanceId: string;
  label: string;
  capabilities: Capability[];
  status: "online";
}

// --- Instance ↔ hub reverse-tunnel frames -----------------------------------

/** First frame after the socket opens — registers the instance. */
export interface HelloFrame {
  type: "hello";
  instanceId: string;
  label: string;
  capabilities: Capability[];
}

/** A command forwarded down from a dashboard, awaiting an {@link RpcResultFrame}. */
export interface RpcFrame {
  type: "rpc";
  id: string;
  cmd: string;
  args?: Record<string, unknown>;
}

/** The instance's reply to an {@link RpcFrame}, correlated by `id`. */
export interface RpcResultFrame {
  type: "rpc-result";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** Unsolicited push from the instance (log line, result, schedule change). */
export interface EventFrame {
  type: "event";
  event: string;
  payload: unknown;
}

export interface PingFrame {
  type: "ping";
}
export interface PongFrame {
  type: "pong";
}

/** The full set of frames carried on the instance ↔ hub tunnel. */
export type HubFrame = HelloFrame | RpcFrame | RpcResultFrame | EventFrame | PingFrame | PongFrame;

// --- Dashboard ↔ hub --------------------------------------------------------

/** An event fanned out to dashboards, tagged with its source instance. */
export interface DashboardEventFrame {
  instanceId: string;
  event: string;
  payload: unknown;
}

/** The envelope returned by an RPC — identical to a direct server's `/rpc/:cmd`. */
export type RpcResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Canonical hub route shapes, shared by host + client transport. */
export const HUB_ROUTES = {
  agentConnect: "/agent/connect",
  instances: "/api/instances",
  events: "/api/events",
  rpc: (instanceId: string, cmd: string) => `/api/i/${instanceId}/rpc/${cmd}`,
} as const;
