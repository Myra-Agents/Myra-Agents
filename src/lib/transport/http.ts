import type { Transport, UnlistenFn } from "./types";

interface RpcOk<T> {
  ok: true;
  data: T;
}
interface RpcErr {
  ok: false;
  error: string;
}

type Handler = (event: { payload: unknown }) => void;
interface EventFrame {
  event: string;
  payload: unknown;
}

/**
 * HTTP transport — talks to a remote / self-hosted / sidecar Node server over
 * `POST {baseUrl}/rpc/:cmd` (body = args) for commands and a single
 * `{baseUrl}/events` WebSocket for push frames.
 *
 * One WebSocket is shared by all listeners on this connection. It opens lazily
 * (first `listen`), reconnects with exponential backoff while any listener is
 * registered, and closes when the last one unsubscribes. Frames are demuxed to
 * handlers by event name.
 */
export function createHttpTransport(baseUrl: string, token?: string): Transport {
  const root = baseUrl.replace(/\/$/, "");
  // The browser WebSocket can't set an Authorization header, so a locked-down
  // server (MYRA_SERVER_TOKEN) takes the token as a `?token=` query param.
  const wsUrl = `${root.replace(/^http/, "ws")}/events${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const handlers = new Map<string, Set<Handler>>();

  let socket: WebSocket | undefined;
  let backoff = 500;
  const MAX_BACKOFF = 10_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function dispatch(raw: string): void {
    let frame: EventFrame;
    try {
      frame = JSON.parse(raw) as EventFrame;
    } catch {
      return;
    }
    const set = handlers.get(frame.event);
    if (!set) return;
    for (const handler of set) handler({ payload: frame.payload });
  }

  function openSocket(): void {
    if (socket || handlers.size === 0 || typeof WebSocket === "undefined") return;
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
        // ignore — onclose drives the reconnect.
      }
    };
  }

  function scheduleReconnect(): void {
    if (reconnectTimer || handlers.size === 0) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      openSocket();
    }, backoff);
  }

  function closeSocket(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    if (socket) {
      const ws = socket;
      socket = undefined;
      try {
        ws.close();
      } catch {
        // already closing.
      }
    }
  }

  return {
    async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
      const res = await fetch(`${root}/rpc/${cmd}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
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

    async listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
      const typed = handler as Handler;
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(typed);
      openSocket();

      return () => {
        const current = handlers.get(event);
        if (current) {
          current.delete(typed);
          if (current.size === 0) handlers.delete(event);
        }
        if (handlers.size === 0) closeSocket();
      };
    },
  };
}
