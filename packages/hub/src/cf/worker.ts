/// <reference types="@cloudflare/workers-types" />
import { sign, verify } from "hono/jwt";

import { INSTALL_PS1, INSTALL_SH } from "./install-scripts";
import type { Env } from "./user-hub";

export { UserHub } from "./user-hub";

/**
 * Stateless edge front door for the relay.
 *
 * Authenticates every request, derives `userId`, and forwards to that user's
 * Durable Object (`env.USER_HUB.idFromName(userId)`), which colocates all of the
 * user's instances + dashboards — so there is no presence store / pub-sub bus /
 * sticky-session tier. Token kinds:
 *  - dashboard requests carry a **session** token (Bearer / `?token=`),
 *  - instance tunnels carry an **instance** token (`?token=`),
 *  - enrollment carries a one-time pairing **code**, resolved to a user via KV.
 *
 * Phase-4 skeleton: type-checks against workers-types; not yet deployed
 * (`docs/centralized-hub-plan.md` P4). Deploy with `wrangler deploy`.
 */
const SESSION_TTL_S = 60 * 60;

// The dashboard is a desktop app (Tauri webview, origin `tauri://localhost` on
// macOS/Linux or `(http|https)://tauri.localhost` on Windows) plus the Next dev
// server; all call the hub cross-origin. Allowlist them so the browser doesn't
// block the preflight. Override with MYRA_CORS_ORIGIN (comma-separated).
const DEFAULT_ORIGINS =
  "http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,https://tauri.localhost,http://tauri.localhost";

function allowedOrigins(env: Env): string[] {
  return (env.MYRA_CORS_ORIGIN ?? DEFAULT_ORIGINS)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** CORS headers for an allowed origin, or none when the origin isn't allowed. */
function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Preflight: answer before any auth/routing.
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    }
    const resp = await handle(req, env);
    // Stamp CORS on normal responses; never on a 101 WebSocket upgrade (its
    // headers are immutable and it carries no body the browser CORS-checks).
    if (resp.status === 101) return resp;
    const headers = new Headers(resp.headers);
    for (const [k, v] of Object.entries(corsHeaders(req, env))) headers.set(k, v);
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
  },
};

async function handle(req: Request, env: Env): Promise<Response> {
  {
    const url = new URL(req.url);
    const secret = env.MYRA_HUB_SECRET;

    if (url.pathname === "/healthz") return json({ ok: true });

    // Bootstrap install scripts — unauthenticated GET on purpose: they carry no
    // secrets (the pairing CODE is supplied at runtime via env), and the remote
    // one-liner curls them before any credential exists.
    if (url.pathname === "/install-remote.sh" && req.method === "GET") {
      return new Response(INSTALL_SH, { headers: { "content-type": "text/x-shellscript; charset=utf-8" } });
    }
    if (url.pathname === "/install-remote.ps1" && req.method === "GET") {
      return new Response(INSTALL_PS1, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    // Dev login placeholder (gated). Real deploys wire OIDC / magic-link.
    if (url.pathname === "/auth/login" && req.method === "POST") {
      if (!env.MYRA_HUB_DEV_LOGIN) return json({ ok: false, error: "dev login disabled" }, 501);
      const body = (await req.json().catch(() => ({}))) as { userId?: string };
      const userId = body.userId?.trim();
      if (!userId) return json({ ok: false, error: "missing userId" }, 400);
      const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
      const token = await sign({ sub: userId, typ: "session", exp }, secret, "HS256");
      return json({ ok: true, data: { token } });
    }

    // Instance reverse tunnel: verify the instance token's signature to route.
    if (url.pathname === "/agent/connect") {
      const token = url.searchParams.get("token") ?? "";
      const claims = await decode(token, secret, "instance");
      if (!claims?.iid) return new Response("unauthorized", { status: 401 });
      return route(env, claims.sub, req, { "x-myra-instance": claims.iid });
    }

    // Dashboard event stream (token on the query string).
    if (url.pathname === "/api/events") {
      const userId = (await decode(url.searchParams.get("token") ?? "", secret, "session"))?.sub;
      if (!userId) return new Response("unauthorized", { status: 401 });
      return route(env, userId, req, {});
    }

    // Enrollment: resolve the one-time pairing code → userId via KV, then ask
    // that user's DO to issue a credential.
    if (url.pathname === "/enroll" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { code?: string; instanceId?: string; label?: string };
      if (!body.code || !body.instanceId) return json({ ok: false, error: "missing code or instanceId" }, 400);
      const userId = await env.PAIRING.get(`code:${body.code.toUpperCase()}`);
      if (!userId) return json({ ok: false, error: "invalid or expired pairing code" }, 400);
      await env.PAIRING.delete(`code:${body.code.toUpperCase()}`);
      const issueReq = new Request("https://do/internal/issue-credential", {
        method: "POST",
        body: JSON.stringify({ instanceId: body.instanceId, label: body.label }),
      });
      return route(env, userId, issueReq, {});
    }

    // Everything else needs a session.
    const sessionToken = bearer(req) ?? url.searchParams.get("token") ?? "";
    const userId = (await decode(sessionToken, secret, "session"))?.sub;
    if (!userId) return json({ ok: false, error: "unauthorized" }, 401);

    // Pairing: the DO mints the code; mirror it into KV so /enroll can find the user.
    if (url.pathname === "/api/instances/pair" && req.method === "POST") {
      const resp = await route(env, userId, req, {});
      const data = (await resp.clone().json()) as { ok: boolean; data?: { code: string } };
      if (data.ok && data.data) await env.PAIRING.put(`code:${data.data.code}`, userId, { expirationTtl: 600 });
      return resp;
    }

    return route(env, userId, req, {});
  }
}

/** Forward a request to the user's Durable Object, stamping the verified identity. */
function route(env: Env, userId: string, req: Request, extra: Record<string, string>): Promise<Response> {
  const stub = env.USER_HUB.get(env.USER_HUB.idFromName(userId));
  const headers = new Headers(req.headers);
  headers.set("x-myra-user", userId);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return stub.fetch(new Request(req, { headers }));
}

interface Decoded {
  sub: string;
  iid?: string;
}
async function decode(token: string, secret: string, typ: "session" | "instance"): Promise<Decoded | null> {
  if (!token) return null;
  try {
    const claims = (await verify(token, secret, "HS256")) as unknown as { sub: string; typ: string; iid?: string };
    if (claims.typ !== typ) return null;
    return { sub: claims.sub, iid: claims.iid };
  } catch {
    return null;
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
