import { dispatchData, type Store, UnknownCommandError } from "@myra/shared";
import { Hono } from "hono";
import { createBunWebSocket, serveStatic } from "hono/bun";
import { cors } from "hono/cors";

import { EventBus } from "./realtime/bus";
import { AgentRunner } from "./runner/agent-runner";
import { dispatchAgent } from "./runner/dispatch";
import { dispatchOs } from "./runner/os";
import { FileStore, isDemoMode, resolveDataDir } from "./store/file-store";

export interface AppDeps {
  store?: Store;
  bus?: EventBus;
  runner?: AgentRunner;
}

/**
 * Build the Hono app for one backend instance. Generic RPC over
 * `POST /rpc/:cmd` (body = args) mirroring the client's `invoke(cmd, args)`,
 * a `GET /events` WebSocket carrying push frames, plus `GET /healthz`. Never
 * serves HTML. Data commands go through `dispatchData`; agent commands
 * (launch/cancel/logs/plan/trigger) fall back to `dispatchAgent` (the runner).
 *
 * Returns the `store`, `bus`, and `runner` (for the scheduler + watcher that
 * `index.ts` wires up) and the Bun `websocket` handler that `index.ts` must
 * export alongside `fetch` for the WS route to upgrade.
 */
export function createApp(deps: AppDeps = {}) {
  const store = deps.store ?? new FileStore();
  const bus = deps.bus ?? new EventBus();
  const runner = deps.runner ?? new AgentRunner(store, bus);
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
      // Three dispatch layers, tried in order: data CRUD against the store,
      // OS file-open helpers, then the agent runner. Each rethrows
      // UnknownCommandError so the next layer gets a try; the last → 400.
      let data: unknown;
      try {
        data = await dispatchData(store, cmd, args);
      } catch (errData) {
        if (!(errData instanceof UnknownCommandError)) throw errData;
        try {
          data = await dispatchOs(store, cmd, args);
        } catch (errOs) {
          if (!(errOs instanceof UnknownCommandError)) throw errOs;
          data = await dispatchAgent(runner, cmd, args);
        }
      }
      return c.json({ ok: true, data });
    } catch (err) {
      if (err instanceof UnknownCommandError) {
        return c.json({ ok: false, error: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: message }, 500);
    }
  });

  // Optional single-process self-host: serve the static client export from the
  // same server. Off by default; `MYRA_SERVE_STATIC=1` uses `./out`, or set it
  // to a custom directory. Registered last so the API routes above win.
  const staticRoot = process.env.MYRA_SERVE_STATIC;
  if (staticRoot) {
    app.use("/*", serveStatic({ root: staticRoot === "1" ? "./out" : staticRoot }));
  }

  return { app, bus, runner, store, websocket };
}
