import type { Transport, UnlistenFn } from "./types";

interface RpcOk<T> {
  ok: true;
  data: T;
}
interface RpcErr {
  ok: false;
  error: string;
}

/**
 * HTTP transport — talks to a remote / self-hosted / sidecar Node server over
 * `POST {baseUrl}/rpc/:cmd` (body = args) plus a `{baseUrl}/events` WebSocket.
 *
 * Phase 3a: `invoke` is live. `listen` is still a no-op stub — the `/events`
 * WebSocket wiring lands in Phase 3b.
 */
export function createHttpTransport(baseUrl: string): Transport {
  const root = baseUrl.replace(/\/$/, "");

  return {
    async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
      const res = await fetch(`${root}/rpc/${cmd}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args ?? {}),
      });

      let payload: RpcOk<T> | RpcErr;
      try {
        payload = (await res.json()) as RpcOk<T> | RpcErr;
      } catch {
        throw new Error(`[HTTP transport] ${cmd}: ${res.status} ${res.statusText} (non-JSON response)`);
      }

      if (!payload.ok) {
        throw new Error(`[HTTP transport] ${cmd}: ${payload.error}`);
      }
      return payload.data;
    },

    async listen<_T>(): Promise<UnlistenFn> {
      // No live channel until Phase 3b wires the /events WebSocket.
      return () => undefined;
    },
  };
}
