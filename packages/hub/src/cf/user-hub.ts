/// <reference types="@cloudflare/workers-types" />
import {
  type Capability,
  type DashboardEventFrame,
  type HubFrame,
  type InstanceInfo,
  PRESENCE_EVENT,
  type RpcResult,
} from "@myra/shared";

import { AuthService } from "../core/auth";
import { DOCredentialStore } from "./do-credential-store";

/**
 * UserHub — the Cloudflare Durable Object host for the relay, one per user.
 *
 * Same role as the in-memory Node host (`node/app.ts`), but built for the edge:
 *  - **WebSocket Hibernation** — sockets are accepted via
 *    `state.acceptWebSocket()`, so the object is evicted from memory while idle
 *    and rehydrated by the next frame. In-memory maps don't survive that, so
 *    live sockets are found via `state.getWebSockets(tag)` and each socket's
 *    role/identity is stored with `serializeAttachment()` — not in a field.
 *  - **Pending RPCs** live in memory, which is safe because an awaiting RPC
 *    keeps the object active; hibernation only happens when fully idle.
 *
 * The Worker (`worker.ts`) authenticates every request and forwards the
 * verified `userId` (+ `instanceId` for tunnels) via headers, so this object
 * trusts those headers — it is only reachable through the Worker.
 *
 * NOTE: this is a phase-4 skeleton. It type-checks against workers-types but has
 * not been deployed/exercised — see `docs/centralized-hub-plan.md` (P4).
 */
export interface Env {
  USER_HUB: DurableObjectNamespace;
  PAIRING: KVNamespace;
  /** Account records (`acct:<userId>` → AccountInfo). */
  ACCOUNTS: KVNamespace;
  /** Refresh tokens (`rt:<token>`) + desktop handoff codes (`ho:<code>`). */
  AUTH: KVNamespace;
  MYRA_HUB_SECRET: string;
  /** Clerk issuer (e.g. https://<subdomain>.clerk.accounts.dev). */
  CLERK_ISSUER: string;
  /** Clerk JWKS endpoint used to verify Clerk-issued JWTs. */
  CLERK_JWKS_URL: string;
  /** Optional audience to enforce when a Clerk JWT template sets `aud`. */
  CLERK_AUDIENCE?: string;
  /** Comma-separated CORS allowlist override; defaults cover the dashboard apps. */
  MYRA_CORS_ORIGIN?: string;
}

interface SocketAttachment {
  role: "instance" | "dashboard";
  instanceId?: string;
  label?: string;
  capabilities?: Capability[];
}

const RPC_TIMEOUT_MS = 30_000;

export class UserHub implements DurableObject {
  private auth: AuthService;
  private pending = new Map<string, (result: RpcResult) => void>();

  constructor(
    private state: DurableObjectState,
    env: Env,
  ) {
    this.auth = new AuthService(env.MYRA_HUB_SECRET, { credentials: new DOCredentialStore(state.storage) });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const userId = req.headers.get("x-myra-user") ?? "";

    if (url.pathname === "/agent/connect") {
      const instanceId = req.headers.get("x-myra-instance") ?? "";
      return this.openSocket({ role: "instance", instanceId });
    }
    if (url.pathname === "/api/events") {
      return this.openSocket({ role: "dashboard" });
    }
    if (url.pathname === "/api/instances" && req.method === "GET") {
      return json({ ok: true, data: this.listInstances() });
    }
    if (url.pathname === "/api/instances/pair" && req.method === "POST") {
      // The Worker mirrors the returned code → userId into KV for /enroll routing.
      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
      return json({ ok: true, data: { code } });
    }
    if (url.pathname === "/internal/issue-credential" && req.method === "POST") {
      const body = (await req.json()) as { instanceId: string; label?: string };
      const token = await this.auth.issueInstanceCredential(userId, body.instanceId, body.label ?? body.instanceId);
      return json({ ok: true, data: { token, userId } });
    }
    const revoke = url.pathname.match(/^\/api\/instances\/([^/]+)\/revoke$/);
    if (revoke && req.method === "POST") {
      const instanceId = decodeURIComponent(revoke[1]);
      const existed = await this.auth.revoke(userId, instanceId);
      this.closeInstance(instanceId);
      return json({ ok: true, data: { revoked: existed } });
    }
    const rpc = url.pathname.match(/^\/api\/i\/([^/]+)\/rpc\/([^/]+)$/);
    if (rpc && req.method === "POST") {
      const instanceId = decodeURIComponent(rpc[1]);
      const cmd = decodeURIComponent(rpc[2]);
      let args: Record<string, unknown> | undefined;
      try {
        const text = await req.text();
        args = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
      } catch {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }
      const result = await this.rpc(instanceId, cmd, args);
      return json(result, result.ok ? 200 : 502);
    }
    return json({ ok: false, error: "not found" }, 404);
  }

  // --- sockets (hibernation) ------------------------------------------------

  private openSocket(attachment: SocketAttachment): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // The tag lets us enumerate sockets by role after a hibernation wake.
    this.state.acceptWebSocket(server, [attachment.role]);
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const frame = parseFrame(message);
    if (!frame) return;
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;

    if (att.role === "instance") {
      if (frame.type === "hello") {
        ws.serializeAttachment({ ...att, label: frame.label, capabilities: frame.capabilities });
        return;
      }
      if (frame.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" } satisfies HubFrame));
        return;
      }
      if (frame.type === "pong") return;
      if (frame.type === "rpc-result") {
        const resolve = this.pending.get(frame.id);
        if (resolve) {
          this.pending.delete(frame.id);
          resolve(frame.ok ? { ok: true, data: frame.data } : { ok: false, error: frame.error ?? "unknown error" });
        }
        return;
      }
      if (frame.type === "event") {
        this.fanToDashboards({ instanceId: att.instanceId ?? "", event: frame.event, payload: frame.payload });
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (att?.role === "instance" && att.instanceId) {
      this.fanToDashboards({ instanceId: att.instanceId, event: PRESENCE_EVENT, payload: { online: false } });
    }
  }

  // --- routing helpers ------------------------------------------------------

  private instanceSocket(instanceId: string): WebSocket | undefined {
    for (const ws of this.state.getWebSockets("instance")) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (att?.instanceId === instanceId) return ws;
    }
    return undefined;
  }

  private listInstances(): InstanceInfo[] {
    return this.state.getWebSockets("instance").flatMap((ws) => {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (!att?.instanceId) return [];
      return [
        {
          instanceId: att.instanceId,
          label: att.label ?? att.instanceId,
          capabilities: att.capabilities ?? [],
          status: "online" as const,
        },
      ];
    });
  }

  private fanToDashboards(frame: DashboardEventFrame): void {
    const json = JSON.stringify(frame);
    for (const ws of this.state.getWebSockets("dashboard")) {
      try {
        ws.send(json);
      } catch {
        // broken socket; close cleans it up.
      }
    }
  }

  private closeInstance(instanceId: string): void {
    const ws = this.instanceSocket(instanceId);
    if (!ws) return;
    try {
      ws.close(1008, "revoked");
    } catch {
      // already closing.
    }
  }

  private rpc(instanceId: string, cmd: string, args?: Record<string, unknown>): Promise<RpcResult> {
    const ws = this.instanceSocket(instanceId);
    if (!ws) return Promise.resolve({ ok: false, error: `instance "${instanceId}" not connected` });
    const id = crypto.randomUUID();
    return new Promise<RpcResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: `rpc "${cmd}" timed out` });
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      try {
        ws.send(JSON.stringify({ type: "rpc", id, cmd, args } satisfies HubFrame));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  }
}

function parseFrame(data: string | ArrayBuffer): HubFrame | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as HubFrame;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
