import { dispatchData, UnknownCommandError } from "@myra/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { FileStore, isDemoMode, resolveDataDir } from "./store/file-store";

/**
 * Build the Hono app for one backend instance. Generic RPC over
 * `POST /rpc/:cmd` (body = args) mirroring the client's `invoke(cmd, args)`,
 * plus `GET /healthz`. Never serves HTML. Agent/OS commands land in Phase 3c.
 */
export function createApp(store = new FileStore()) {
  const app = new Hono();

  // The web client runs on a different origin (localhost:1420) than the
  // server, so allow cross-origin RPC. Tighten the allowlist once auth lands.
  app.use("/*", cors());

  app.get("/healthz", (c) =>
    c.json({ ok: true, demo: isDemoMode(), dataDir: resolveDataDir(), ts: new Date().toISOString() }),
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

  return app;
}
