import type { Transport } from "@/lib/transport/types";

export type ConnectionKind = "sidecar" | "remote" | "hub-instance";
export type ConnectionStatus = "connected" | "connecting" | "error" | "disabled";

/**
 * A single backend the client talks to. Phase 2 holds exactly one; Phase 4
 * holds several at once, each tagged by id so cards can be namespaced
 * (`GlobalId = ${connId}::${entityId}`). Phase P3 adds `hub-instance`: a
 * connection backed by one instance reached through a shared hub, where
 * `connId = ${hubId}:${instanceId}`.
 */
export interface Connection {
  id: string; // stable local id ("local" = in-process desktop / offline browser)
  label: string; // user-facing name
  baseUrl: string; // http(s)://host:port ("" = in-process, no HTTP)
  kind: ConnectionKind;
  auth?: { token?: string }; // reserved; auth deferred
  status: ConnectionStatus;
  hubId?: string; // hub-instance only: the owning hub registration
  instanceId?: string; // hub-instance only: the bare instance id within the hub
  version?: string; // server build the backend reported, if known (hub-instance: from InstanceInfo)
}

/** A connection paired with the transport that reaches it. */
export interface ConnectionEntry {
  connection: Connection;
  transport: Transport;
}

/** A registered hub: one URL + session token that expands into N instance connections. */
export interface HubRegistration {
  id: string;
  label: string;
  baseUrl: string;
  token: string;
}
