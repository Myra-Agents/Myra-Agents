/// <reference types="@cloudflare/workers-types" />
import type { AccountInfo, AuthTokens } from "@myra/shared";
import { AUTH_ROUTES } from "@myra/shared";
import { verify } from "hono/jwt";

import { AuthService } from "../core/auth";
import { deriveAccount, verifyClerkToken } from "../core/clerk";
import { KvAccountStore } from "./account-store";
import { INSTALL_PS1, INSTALL_SH } from "./install-scripts";
import { KvHandoffStore, KvRefreshStore } from "./refresh-store";
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

    // --- authentication (Clerk proves identity; the hub owns sessions) ------
    const auth = new AuthService(secret, { refresh: new KvRefreshStore(env.AUTH) });
    const accounts = new KvAccountStore(env.ACCOUNTS);

    // Exchange a verified Clerk token for a hub session + refresh.
    if (url.pathname === AUTH_ROUTES.exchange && req.method === "POST") {
      const account = await accountFromClerk(req, env, accounts);
      if (!account) return json({ ok: false, error: "invalid identity token" }, 401);
      const tokens = await mintTokens(auth, account);
      return json({ ok: true, data: { ...tokens, account } });
    }

    // Rotate a refresh token (single-use) → fresh session + refresh.
    if (url.pathname === AUTH_ROUTES.refresh && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { refresh?: string };
      if (!body.refresh) return json({ ok: false, error: "missing refresh token" }, 400);
      try {
        const { userId } = await auth.consumeRefresh(body.refresh);
        const account = (await accounts.get(userId)) ?? { userId, tier: "free", role: "member" };
        const tokens = await mintTokens(auth, account);
        return json({ ok: true, data: { ...tokens, account } });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : "refresh failed" }, 401);
      }
    }

    // Logout — revoke the refresh token.
    if (url.pathname === AUTH_ROUTES.logout && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { refresh?: string };
      if (body.refresh) await auth.revokeRefresh(body.refresh);
      return json({ ok: true });
    }

    // Desktop handoff: bridge page (already Clerk-authed in the system browser)
    // stashes the minted tokens under a one-time code so they never ride the
    // myra:// deep-link URL.
    if (url.pathname === AUTH_ROUTES.desktopHandoff && req.method === "POST") {
      const account = await accountFromClerk(req, env, accounts);
      if (!account) return json({ ok: false, error: "invalid identity token" }, 401);
      const tokens = await mintTokens(auth, account);
      const code = crypto.randomUUID().replace(/-/g, "");
      await new KvHandoffStore(env.AUTH).put(code, tokens);
      return json({ ok: true, data: { code } });
    }

    // Desktop claim: the app exchanges the one-time code for its tokens.
    if (url.pathname === AUTH_ROUTES.desktopClaim && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { code?: string };
      if (!body.code) return json({ ok: false, error: "missing code" }, 400);
      const tokens = await new KvHandoffStore(env.AUTH).take(body.code);
      if (!tokens) return json({ ok: false, error: "invalid or expired code" }, 400);
      return json({ ok: true, data: tokens });
    }

    // Who am I — decode the session claims for the UI / entitlement.
    if (url.pathname === AUTH_ROUTES.me && req.method === "GET") {
      const token = bearer(req) ?? url.searchParams.get("token") ?? "";
      try {
        const claims = await auth.verifySession(token);
        return json({
          ok: true,
          data: { userId: claims.sub, tier: claims.tier, role: claims.role, orgId: claims.orgId },
        });
      } catch {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
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

// --- Clerk identity → hub account -------------------------------------------

/** Verify the request's Clerk bearer token, then upsert + return the account. */
async function accountFromClerk(req: Request, env: Env, accounts: KvAccountStore): Promise<AccountInfo | null> {
  const payload = await verifyClerkToken(bearer(req) ?? "", {
    issuer: env.CLERK_ISSUER,
    jwksUrl: env.CLERK_JWKS_URL,
    audience: env.CLERK_AUDIENCE,
  });
  if (!payload?.sub) return null;
  const account = deriveAccount(payload, await accounts.get(`clerk:${payload.sub}`));
  await accounts.upsert(account);
  return account;
}

/** Mint a fresh session + refresh pair for an account. */
async function mintTokens(auth: AuthService, account: AccountInfo): Promise<AuthTokens> {
  const session = await auth.issueSession(account);
  const refresh = await auth.issueRefresh(account.userId);
  return { session, refresh };
}
