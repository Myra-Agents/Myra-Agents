import { type Store, UnknownCommandError } from "@myra/shared";
import { Hono } from "hono";
import { createBunWebSocket, serveStatic } from "hono/bun";
import { cors } from "hono/cors";

import { EventBus } from "./realtime/bus";
import { AgentRunner } from "./runner/agent-runner";
import { dispatchCommand } from "./runner/dispatch-all";
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
/** Pull a bearer token from the `Authorization` header or a `?token=` query param. */
function bearerToken(authHeader?: string, queryToken?: string): string | undefined {
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return queryToken && queryToken.length > 0 ? queryToken : undefined;
}

export function createApp(deps: AppDeps = {}) {
  const store = deps.store ?? new FileStore();
  const bus = deps.bus ?? new EventBus();
  const runner = deps.runner ?? new AgentRunner(store, bus);
  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const app = new Hono();

  // The web client runs on a different origin (localhost:1420) than the
  // server, so allow cross-origin RPC — but to an allowlist, not `*`. Override
  // with MYRA_CORS_ORIGIN (comma-separated) for a self-host on another origin.
  const allowedOrigins = (process.env.MYRA_CORS_ORIGIN ?? "http://localhost:1420,http://127.0.0.1:1420")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use("/*", cors({ origin: allowedOrigins }));

  // Optional auth for the direct server. When MYRA_SERVER_TOKEN is set, every
  // /rpc and /events request must carry it (Bearer header, or `?token=` for the
  // browser WebSocket which can't set headers). Unset = open (desktop sidecar on
  // 127.0.0.1, the default) — backward compatible. The hub path has its own JWT.
  const serverToken = process.env.MYRA_SERVER_TOKEN;
  if (serverToken) {
    app.use("/rpc/*", async (c, next) => {
      if (bearerToken(c.req.header("authorization"), c.req.query("token")) !== serverToken) {
        return c.json({ ok: false, error: "unauthorized" }, 401);
      }
      return next();
    });
    app.use("/events", async (c, next) => {
      if (bearerToken(c.req.header("authorization"), c.req.query("token")) !== serverToken) {
        return c.json({ ok: false, error: "unauthorized" }, 401);
      }
      return next();
    });
  }

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
      // Data CRUD → OS file-open → agent runner, tried in order; an unknown
      // command in the last layer surfaces as UnknownCommandError → 400.
      const data = await dispatchCommand(store, runner, cmd, args);
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
