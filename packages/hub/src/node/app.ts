import type { HubFrame } from "@myra/shared";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";

import { type FrameSink, HubCore } from "../core/hub";

/**
 * In-memory Node host for the relay core (Hono on Bun). One process, single
 * node — used for dev/tests and as the self-hosted gateway. The Cloudflare
 * Durable Object host (phase 4) wraps the same {@link HubCore}.
 *
 * Auth is a phase-1 dev placeholder: the user is taken from `?userId=` (sockets)
 * or the `X-Dev-User` header (REST), defaulting to "dev". Phase 2 replaces this
 * with session JWTs + per-instance Bearer credentials.
 */
export function createHubApp() {
  const hub = new HubCore();
  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const app = new Hono();

  app.use("/*", cors());
  app.get("/healthz", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

  const devUser = (c: {
    req: { header(n: string): string | undefined; query(n: string): string | undefined };
  }): string => c.req.header("x-dev-user") ?? c.req.query("userId") ?? "dev";

  // Instance reverse tunnel: instances dial in here and register.
  app.get(
    "/agent/connect",
    upgradeWebSocket((c) => {
      const userId = c.req.query("userId") ?? "dev";
      let instanceId: string | null = null;
      let sink: FrameSink | null = null;
      return {
        onOpen(_event, ws) {
          sink = {
            send: (frame) => {
              try {
                ws.send(JSON.stringify(frame));
              } catch {
                // socket gone; onClose cleans up.
              }
            },
            close: () => {
              try {
                ws.close();
              } catch {
                // already closing.
              }
            },
          };
        },
        onMessage(event) {
          const frame = parseFrame(event.data);
          if (!frame || !sink) return;
          if (frame.type === "hello") {
            instanceId = frame.instanceId;
            hub.addInstance(userId, {
              instanceId: frame.instanceId,
              label: frame.label,
              capabilities: frame.capabilities,
              sink,
            });
            return;
          }
          if (frame.type === "ping") {
            sink.send({ type: "pong" });
            return;
          }
          if (frame.type === "pong") return;
          if (instanceId) hub.handleInstanceFrame(userId, instanceId, frame);
        },
        onClose() {
          if (instanceId && sink) hub.removeInstance(userId, instanceId, sink);
        },
        onError() {
          if (instanceId && sink) hub.removeInstance(userId, instanceId, sink);
        },
      };
    }),
  );

  // Dashboard event stream: one socket, multiplexed across the user's instances.
  app.get(
    "/api/events",
    upgradeWebSocket((c) => {
      const userId = c.req.query("userId") ?? "dev";
      let unsubscribe: (() => void) | undefined;
      return {
        onOpen(_event, ws) {
          unsubscribe = hub.addDashboard(userId, {
            send: (frame) => {
              try {
                ws.send(JSON.stringify(frame));
              } catch {
                // socket gone; onClose cleans up.
              }
            },
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

  app.get("/api/instances", (c) => c.json({ ok: true, data: hub.listInstances(devUser(c)) }));

  app.post("/api/i/:instanceId/rpc/:cmd", async (c) => {
    const userId = devUser(c);
    const instanceId = c.req.param("instanceId");
    const cmd = c.req.param("cmd");
    let args: Record<string, unknown> | undefined;
    try {
      const text = await c.req.text();
      args = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
    } catch {
      return c.json({ ok: false, error: "invalid JSON body" }, 400);
    }
    const result = await hub.rpc(userId, instanceId, cmd, args);
    return c.json(result, result.ok ? 200 : 502);
  });

  return { app, websocket, hub };
}

function parseFrame(data: unknown): HubFrame | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as HubFrame;
  } catch {
    return null;
  }
}
