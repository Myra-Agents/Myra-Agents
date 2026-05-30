import type { Transport, UnlistenFn } from "./types";

/**
 * HTTP transport — talks to a remote / self-hosted / sidecar Node server over
 * `POST {baseUrl}/rpc/:cmd` plus a `{baseUrl}/events` WebSocket.
 *
 * Stubbed in Phase 2 (no server exists yet); implemented in Phase 3 once
 * `@myra/server` is up. Kept here so the transport set and ConnectionManager
 * are shape-complete and `remote` connections can be wired without churn.
 */
export function createHttpTransport(baseUrl: string): Transport {
  return {
    async invoke<T>(cmd: string): Promise<T> {
      throw new Error(`[HTTP transport] not implemented yet (cmd "${cmd}" → ${baseUrl}); lands in Phase 3`);
    },
    async listen<_T>(): Promise<UnlistenFn> {
      // No live channel until Phase 3 wires the /events WebSocket.
      return () => undefined;
    },
  };
}
