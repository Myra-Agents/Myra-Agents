import type { Transport } from "@/lib/transport/types";

export type ConnectionKind = "sidecar" | "remote";
export type ConnectionStatus = "connected" | "connecting" | "error" | "disabled";

/**
 * A single backend the client talks to. Phase 2 holds exactly one; Phase 4
 * holds several at once, each tagged by id so cards can be namespaced
 * (`GlobalId = ${connId}::${entityId}`).
 */
export interface Connection {
  id: string; // stable local id ("local" = in-process desktop / offline browser)
  label: string; // user-facing name
  baseUrl: string; // http(s)://host:port ("" = in-process, no HTTP)
  kind: ConnectionKind;
  auth?: { token?: string }; // reserved; auth deferred
  status: ConnectionStatus;
}

/** A connection paired with the transport that reaches it. */
export interface ConnectionEntry {
  connection: Connection;
  transport: Transport;
}
