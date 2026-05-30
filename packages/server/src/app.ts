import { dispatchData, type EventName, UnknownCommandError } from "@myra/shared";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";

import { EventBus } from "./realtime/bus";
import { FileStore, isDemoMode, resolveDataDir } from "./store/file-store";

export interface AppDeps {
  store?: FileStore;
  bus?: EventBus;
}

/**
 * Build the Hono app for one backend instance. Generic RPC over
 * `POST /rpc/:cmd` (body = args) mirroring the client's `invoke(cmd, args)`,
 * a `GET /events` WebSocket carrying push frames, plus `GET /healthz`. Never
 * serves HTML. Agent/OS commands land in Phase 3c.
 *
 * Returns the `bus` (for in-process emitters) and the Bun `websocket` handler
 * that `index.ts` must export alongside `fetch` for the WS route to upgrade.
 */
export function createApp(deps: AppDeps = {}) {
  const store = deps.store ?? new FileStore();
  const bus = deps.bus ?? new EventBus();
  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const app = new Hono();

  // The web client runs on a different origin (localhost:1420) than the
  // server, so allow cross-origin RPC. Tighten the allowlist once auth lands.
  app.use("/*", cors());

  app.get("/healthz", (c) =>
    c.json({ ok: true, demo: isDemoMode(), dataDir: resolveDataDir(), ts: new Date().toISOString() }),
  );

  // Live push channel: each client opens one WS; the bus fans every emitted
  // frame to all open sockets. Reconnect/backoff lives on the client.
  app.get(
    "/events",
    upgradeWebSocket(() => {
      let unsubscribe: (() => void) | undefined;
      return {
        onOpen(_event, ws) {
          unsubscribe = bus.subscribe((frame) => {
            try {
              ws.send(JSON.stringify(frame));
            } catch {
              // Socket gone mid-send; close cleans it up.
            }
          });
        },
        onClose() {
          unsubscribe?.();
        },
        onError() {
          unsubscribe?.();
        },
      };
    }),
  );

  // Temporary verification hook (Phase 3b): with MYRA_DEBUG=1, push a frame on
  // demand so the WS pipe can be exercised before real emitters exist (3c).
  if (process.env.MYRA_DEBUG === "1") {
    app.post("/debug/emit", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { event?: EventName; payload?: unknown };
      bus.emit(body.event ?? "schedules-updated", body.payload ?? null);
      return c.json({ ok: true });
    });
  }

  app.post("/rpc/:cmd", async (c) => {
    const cmd = c.req.param("cmd");
    let args: Record<string, unknown> | undefined;
    try {
      const text = await c.req.text();
      args = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
    } catch {
      return c.json({ ok: false, error: "invalid JSON body" }, 400);
    }

    try {
      const data = await dispatchData(store, cmd, args);
      return c.json({ ok: true, data });
    } catch (err) {
      if (err instanceof UnknownCommandError) {
        return c.json({ ok: false, error: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: message }, 500);
    }
  });

  return { app, bus, websocket };
}
