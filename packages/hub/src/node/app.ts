import type { HubFrame } from "@myra/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";

import { AuthService } from "../core/auth";
import { AuthStore } from "../core/auth-store";
import { type FrameSink, HubCore } from "../core/hub";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * In-memory Node host for the relay core (Hono on Bun). One process, single
 * node — used for dev/tests and as the self-hosted gateway. The Cloudflare
 * Durable Object host (phase 4) wraps the same {@link HubCore} + {@link AuthService}.
 *
 * Auth (phase 2):
 *  - Dashboards present a **session** token (Bearer header on REST, `?token=` on
 *    the WS). Sessions come from `POST /auth/login` — a dev placeholder gated by
 *    `MYRA_HUB_DEV_LOGIN`; real deploys wire OIDC / magic-link there.
 *  - Instances present an **instance** credential (`?token=` on `/agent/connect`),
 *    obtained by exchanging a one-time pairing code at `POST /enroll`.
 * Every route derives `userId` from the verified token, so users are isolated.
 */
export function createHubApp() {
  const secret = process.env.MYRA_HUB_SECRET?.trim() || crypto.randomUUID();
  if (!process.env.MYRA_HUB_SECRET) {
    console.warn("[myra-hub] MYRA_HUB_SECRET unset — using an ephemeral secret; tokens won't survive a restart.");
  }
  const dir = process.env.MYRA_HUB_DIR?.trim() || join(homedir(), ".myra-hub");
  const store = new AuthStore(join(dir, "auth.json"));
  const auth = new AuthService(secret, store);
  const hub = new HubCore();

  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const app = new Hono();

  app.use("/*", cors());
  app.get("/healthz", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

  const tokenOf = (c: Context): string | undefined => {
    const h = c.req.header("authorization");
    if (h?.startsWith("Bearer ")) return h.slice(7);
    return c.req.query("token") ?? undefined;
  };
  const sessionUser = async (c: Context): Promise<string | null> => {
    const tok = tokenOf(c);
    if (!tok) return null;
    try {
      return await auth.verifySession(tok);
    } catch {
      return null;
    }
  };

  // --- auth + enrollment ----------------------------------------------------

  // Dev login placeholder. Real deploys replace this with OIDC / magic-link.
  app.post("/auth/login", async (c) => {
    if (!process.env.MYRA_HUB_DEV_LOGIN) {
      return c.json({ ok: false, error: "dev login disabled; wire an identity provider" }, 501);
    }
    let body: { userId?: string };
    try {
      body = (await c.req.json()) as { userId?: string };
    } catch {
      return c.json({ ok: false, error: "invalid JSON body" }, 400);
    }
    const userId = body.userId?.trim();
    if (!userId) return c.json({ ok: false, error: "missing userId" }, 400);
    return c.json({ ok: true, data: { token: await auth.issueSession(userId) } });
  });

  // Dashboard mints a one-time pairing code for the logged-in user.
  app.post("/api/instances/pair", async (c) => {
    const userId = await sessionUser(c);
    if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);
    return c.json({ ok: true, data: auth.mintPairingCode(userId) });
  });

  // Machine exchanges a pairing code for a long-lived instance credential.
  app.post("/enroll", async (c) => {
    let body: { code?: string; instanceId?: string; label?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ ok: false, error: "invalid JSON body" }, 400);
    }
    if (!body.code || !body.instanceId) return c.json({ ok: false, error: "missing code or instanceId" }, 400);
    try {
      const result = await auth.enroll(body.code, body.instanceId, body.label?.trim() || body.instanceId);
      return c.json({ ok: true, data: result });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // --- instance reverse tunnel ----------------------------------------------

  app.get(
    "/agent/connect",
    upgradeWebSocket(async (c) => {
      const tok = c.req.query("token");
      let claims: Awaited<ReturnType<typeof auth.verifyInstance>> | null = null;
      try {
        if (tok) claims = await auth.verifyInstance(tok);
      } catch {
        claims = null;
      }
      if (!claims) {
        return {
          onOpen(_event, ws) {
            try {
              ws.close(1008, "unauthorized");
            } catch {
              // ignore.
            }
          },
        };
      }
      const { sub: userId, iid: instanceId } = claims;
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
            hub.addInstance(userId, {
              instanceId,
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
          hub.handleInstanceFrame(userId, instanceId, frame);
        },
        onClose() {
          if (sink) hub.removeInstance(userId, instanceId, sink);
        },
        onError() {
          if (sink) hub.removeInstance(userId, instanceId, sink);
        },
      };
    }),
  );

  // --- dashboard channel ----------------------------------------------------

  app.get(
    "/api/events",
    upgradeWebSocket(async (c) => {
      const tok = c.req.query("token");
      let userId: string | null = null;
      try {
        if (tok) userId = await auth.verifySession(tok);
      } catch {
        userId = null;
      }
      if (!userId) {
        return {
          onOpen(_event, ws) {
            try {
              ws.close(1008, "unauthorized");
            } catch {
              // ignore.
            }
          },
        };
      }
      const uid = userId;
      let unsubscribe: (() => void) | undefined;
      return {
        onOpen(_event, ws) {
          unsubscribe = hub.addDashboard(uid, {
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

  app.get("/api/instances", async (c) => {
    const userId = await sessionUser(c);
    if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);
    return c.json({ ok: true, data: hub.listInstances(userId) });
  });

  app.post("/api/instances/:instanceId/revoke", async (c) => {
    const userId = await sessionUser(c);
    if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);
    const instanceId = c.req.param("instanceId");
    const existed = auth.revoke(userId, instanceId);
    hub.closeInstance(userId, instanceId);
    return c.json({ ok: true, data: { revoked: existed } });
  });

  app.post("/api/i/:instanceId/rpc/:cmd", async (c) => {
    const userId = await sessionUser(c);
    if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);
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

  return { app, websocket, hub, auth };
}

function parseFrame(data: unknown): HubFrame | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as HubFrame;
  } catch {
    return null;
  }
}
