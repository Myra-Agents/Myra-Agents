# Myra Agents — Centralized Dashboard via a Dumb Hub (auth'd relay + DO-per-user)

## Context

Today's `feature/backend-refactor` branch made the backend a standalone Node server and let the client connect to several servers at once — **client-side fan-out**: the browser/Tauri client holds N direct HTTP/WS connections and merges their boards (see [`multi-server-backend-plan.md`](multi-server-backend-plan.md)).

Fan-out only works when every server is directly reachable. It breaks for a machine behind NAT, a corporate firewall, or an ephemeral sandbox — none can accept an inbound connection from a browser. Goal: a **centralized, authenticated relay** those instances dial *out* to, so any instance appears on one board after a single login, regardless of where it runs.

Full visual reference (diagrams + per-box rationale) lives in [`docs/centralized-hub/`](centralized-hub/):
- `architecture-docs.html` — the full design doc (17 sections, 7 diagrams).
- `architecture-hub-design.html` — annotated topology, click-to-question.
- `architecture-explorer.html` — the four-architecture comparison that led here.

**Decisions locked:**
- **Dumb hub.** The hub authenticates, tracks presence, and forwards frames. It stores **no boards** — each instance owns its `board.json` and stays the source of truth.
- **Outbound dial.** Instances open the connection *to* the hub over `wss://…:443` (NAT/firewall-friendly). The hub never connects in to an instance.
- **DO-per-user as the cloud target.** One Cloudflare Durable Object per user colocates all of that user's instances + dashboards, so there is **no shared presence store / pub-sub bus / sticky-session tier** to build.
- **Server unchanged.** `@myra/server`, its dispatch, store, and event bus survive as the per-instance backend. An instance = today's server + a small **connector**.
- **Client barely changes.** Each instance becomes a `Connection` with `connId = instanceId`; the existing `GlobalId = ${connId}::${entityId}` aggregation is untouched.
- **Additive.** Direct fan-out is never removed — it becomes the LAN / self-host path. The hub is a second way in.

**Deferred:** the E2E P2P mesh (phase 7, optional) — lower latency + blind hub, but doesn't improve reachability over the phase-1 hub.

## The defining constraint: the hub is a stateless relay

The hub holds only small per-user durable state (enrolled instances + credential references) and live socket maps. No card data crosses it at rest. This is what makes it horizontally scalable, cheap to operate, and low-liability on breach. **Every phase must preserve the dumb-hub invariant.**

## The relay core is transport-agnostic

The relay logic — auth a socket, register an instance, route an RPC by `instanceId`, fan events to dashboards — is plain TypeScript. It runs two ways from one core:
- **In-memory Node host** (`@myra/hub`, single process) — used for dev, tests, and **doubles as the self-hosted gateway**.
- **Cloudflare Durable Object host** — the managed cloud target; adds hibernation + edge routing.

Building the in-memory host first proves the protocol, connector, and client without Cloudflare; the DO is added later as a deployment adapter, not a rewrite.

## Wire protocol (target)

**Instance ↔ hub** — instance opens `wss://hub/agent/connect` with `Authorization: Bearer <instance-credential>`:

| Direction | Frame |
|---|---|
| instance → hub | `{ type:"hello", instanceId, label, capabilities }` |
| hub → instance | `{ type:"rpc", id, cmd, args }` |
| instance → hub | `{ type:"rpc-result", id, ok, data \| error }` |
| instance → hub | `{ type:"event", event, payload }` |
| both | `{ type:"ping" }` / `{ type:"pong" }` |

**Dashboard ↔ hub** (session JWT):
- `GET /api/instances` → `[{ instanceId, label, status, capabilities }]`
- `POST /api/i/:instanceId/rpc/:cmd` (body = args) → returns the same `{ok,data}` envelope as a direct server today.
- `wss://hub/api/events` → one socket; events multiplexed, each frame tagged with `instanceId`.

## Repo layout (new)

```
packages/
  shared/  @myra/shared
    src/hub-contract.ts      # NEW: frame types, /api routes, capability enum (single source of truth)
  server/  @myra/server
    src/connector/           # NEW: dial-out client — reuses dispatch + EventBus
  hub/     @myra/hub          # NEW package: relay core + in-memory Node host (= self-hosted gateway)
    src/core/                # transport-agnostic relay: registry, router, presence
    src/node/                # Hono/Bun host (single process)
    src/cf/                  # Durable Object + Worker host (added phase 4)
src/
  lib/transport/hub.ts       # NEW: hubTransport (thin variant of http.ts)
  lib/connections/           # ConnectionManager learns to expand a hub into N instance connections
src-tauri/                   # unchanged shell; local stays direct to the sidecar
```

---

## Phased migration

> P0–P1 prove the relay + connector against an in-memory host (no Cloudflare, no auth). P2 adds auth/enrollment. P3 wires the client. P4 deploys on Durable Objects. P5 does the desktop local-direct split + pairing UX. P6 hardens. P7 is the optional mesh. **Every phase keeps direct fan-out working.**

| Phase | Theme | Exit criterion |
|---|---|---|
| P0 ✅ | Protocol + scaffolding | `@myra/hub` builds; `hub-contract.ts` shared; type-check green |
| P1 ✅ | Connector ↔ in-memory relay | A remote instance dials a local hub; an RPC + a streamed event round-trip end to end |
| P2 ✅ | Auth + enrollment | Pairing code → per-instance credential; user session; tenant isolation |
| P3 ✅ | Client `hubTransport` + aggregation | Dashboard adds a hub; its instances appear as `connId=instanceId` connections, merged board, one shared WS |
| P4 | Cloudflare Durable Objects | Same protocol on Worker + UserHub DO with hibernation; deployed |
| P5 | Desktop split + pairing UX | Tauri: `local` direct, remote via hub; "Add instance" pairing in Settings |
| P6 | Hardening + adaptive cadence | Capability scoping, revocation, locked-down direct server, batched scheduled logs |
| P7 | *(optional)* E2E P2P mesh | WebRTC data plane, hub signaling-only, TURN fallback |

---

### Phase 0 — Protocol + scaffolding
**Goal:** lock the wire contract and stand up the empty package.

**Deliverables**
- `packages/shared/src/hub-contract.ts`: frame union (`hello`/`rpc`/`rpc-result`/`event`/`ping`/`pong`), dashboard `/api` route constants, `Capability` enum (`"agent" | "os"`), `InstanceInfo` type. Export from `@myra/shared`.
- `packages/hub` workspace: `package.json`, `tsconfig.json`, empty `core/` with the relay interfaces (`Registry`, `Router`, `HubHost`).
- No behavior yet.

**Verification:** `tsc --noEmit` across shared + hub + client; `biome check`.
**Exit:** package builds, contract imported by a no-op connector stub.

---

### Phase 1 — Connector ↔ in-memory relay
**Goal:** prove one remote instance reaches a dashboard-shaped caller through a relay, no auth, no cloud.

**Deliverables**
- `packages/server/src/connector/`: dials `MYRA_HUB_URL`, sends `hello`, handles `rpc` by calling the **existing** `dispatchData → dispatchOs → dispatchAgent`, replies `rpc-result`, forwards `EventBus` emissions as `event` frames, ping/pong heartbeat, reconnect with jittered backoff. Gated on `MYRA_HUB_URL` being set — absent = server behaves exactly as today.
- `packages/hub/src/core/`: in-memory `Registry` (`Map<instanceId, socket>`), `Router` (correlate `rpc`↔`rpc-result` by `id`, fan `event` to dashboard subscribers).
- `packages/hub/src/node/`: Hono/Bun host exposing `/agent/connect` (WS), `GET /api/instances`, `POST /api/i/:id/rpc/:cmd`, `wss://…/api/events`. Dev-token auth placeholder (`X-Dev-User`).

**Verification:** run server with `MYRA_HUB_URL=ws://localhost:PORT`; from a curl/script, `POST /api/i/<id>/rpc/get_cards` returns the instance's cards; `launch_agent` streams `agent-log-appended` over `/api/events`.
**Exit:** RPC + live event round-trip through the in-memory relay.

---

### Phase 2 — Auth + enrollment
**Goal:** real identity for users and machines; tenant isolation.

**Deliverables**
- **User session:** OIDC or email magic-link → short-lived session JWT + refresh. Hub verifies, derives `userId`.
- **Pairing:** `POST /api/instances/pair` (dashboard, authed) mints a one-time code (short TTL, bound to `userId`). `myra enroll <code>` on the machine swaps it for a long-lived **instance credential** bound to `(userId, instanceId)`; connector stores + uses it on `/agent/connect`.
- **Isolation:** every route filters by `userId`; registry keyed by `userId`. Revocation endpoint invalidates a credential and drops its tunnel.
- Credential + enrolled-instance list persisted in the host's small store (in-memory host: a JSON/SQLite file).

**Verification:** two users can't see each other's instances; revoked instance can't reconnect; expired pairing code rejected.
**Exit:** end-to-end authed enrollment on the in-memory host.

---

### Phase 3 — Client `hubTransport` + aggregation
**Goal:** a hub appears on the board as its instances, reusing the existing aggregation.

**Deliverables**
- `src/lib/transport/hub.ts`: implements `Transport`; RPC → `POST /api/i/:instanceId/rpc/:cmd`; one shared WS to `/api/events` demuxed by `instanceId`. Carries the session token.
- `ConnectionManager` (`manager.ts`): a hub registration calls `GET /api/instances` and **expands** into one `Connection` per instance with `connId = instanceId`, all sharing the hub's transport/socket. Topology refresh on instance connect/disconnect events. `GlobalId` scheme untouched.
- Settings → Connections: "Add hub" (URL + login) alongside the existing "Add server (URL)".

**Verification:** `bun run dev` (browser) against a phase-2 hub with one enrolled instance → its cards merge into the board; mutations route to the right instance; one WebSocket open, not N.
**Exit:** browser dashboard drives a remote instance entirely through the hub.

---

### Phase 4 — Cloudflare Durable Objects host
**Goal:** run the same relay on DO-per-user with hibernation.

**Deliverables**
- `packages/hub/src/cf/`: `UserHub` Durable Object implementing the same `Registry`/`Router` core; sockets accepted via `state.acceptWebSocket()` (hibernation); small bits in DO transactional storage (enrolled list, credential refs). Stateless **Worker** front door: verify JWT → `env.USER_HUB.idFromName(userId)` → forward upgrade.
- `wrangler.toml`, deploy pipeline.
- The Node host stays as the self-hosted gateway; the DO host is the managed target. Core logic shared.

**Verification:** deploy; enroll an instance against the deployed hub; confirm hibernation (idle DO evicted, frame rehydrates); reconnect-storm test with jittered backoff.
**Exit:** managed hub live; idle users cost ≈ 0.

---

### Phase 5 — Desktop split + pairing UX
**Goal:** local-direct on the desktop; first-class pairing.

**Deliverables**
- Tauri client keeps the `local` connection on `tauriTransport`/127.0.0.1 (direct, offline-capable) and adds hub-instance connections via `hubTransport` — mixed transports in one board (already supported by `buildTransport`).
- Settings → Connections "Add instance": shows a pairing code / deep-links `myra enroll`; lists enrolled instances with status + revoke.
- i18n keys in `en.json` + `fr.json`.

**Verification:** desktop run — local sidecar reached directly (works with network off), a remote instance reached through the hub, both merged; pair + revoke from the UI.
**Exit:** the user's stated shape — local + remote + sandbox on one authed board.

---

### Phase 6 — Hardening + adaptive log cadence
**Goal:** production posture and cost control.

**Deliverables**
- **Capability scoping:** honor `capabilities` from `hello`; reject out-of-scope commands.
- **Locked-down direct server:** require a token on `@myra/server`'s HTTP routes too; tighten the wide-open `cors()` in `app.ts`.
- **Revocation + audit:** credential lifecycle, basic connection audit log.
- **Adaptive log cadence:** stream line-by-line only when a card modal is open; scheduled/headless runs batch a coalesced `progress` or send only `started`/`done`; full log fetched on demand via `get_run_log`. Keeps the DO hibernating.
- **Connector resilience:** respect `HTTPS_PROXY` + system CA trust (no cert pinning), heartbeat-driven middlebox keepalive.

**Verification:** corporate-network smoke (proxy + DPI), scheduled run produces no live frames but a fetchable log, revoked credential cannot act.
**Exit:** safe to expose; idle cost minimized.

---

### Phase 7 — *(optional)* E2E P2P mesh
**Goal:** lower latency + a blind hub, when direct connections succeed.

**Deliverables**
- WebRTC data channel dashboard↔instance; hub reduced to signaling + presence. STUN for hole-punching, TURN relay fallback (still E2E). Built as a data-plane layer over the phase-1 control plane — the hub RPC path remains the fallback.

**Verification:** direct P2P when NAT allows; transparent TURN fallback for symmetric-NAT; hub sees only ciphertext.
**Exit:** opt-in mesh; reachability unchanged from phase 1.

---

## Risks (carried from the design doc)

- **Blast radius** — live tunnels into shell-capable machines. Mitigate: per-instance credentials, capability scoping, short-TTL tokens, revocation, roadmap to E2E (P7).
- **Privacy** — phase-1 `hub-trusted` operator can see traffic. Mitigate: be explicit; offer the self-hosted gateway (the P1 Node host) and the P7 mesh.
- **Vendor lock-in** — DO-shaped. Mitigate: transport-agnostic relay core; the Node host is the portable fallback.
- **Whale tenants / reconnect storms / sandbox churn** — per-user DO sharding, jittered backoff + draining, ephemeral TTL presence.

## Verification gates (every phase)

```
npx tsc --noEmit                 # client types
cd packages/shared && tsc --noEmit
cd packages/server && tsc --noEmit
cd packages/hub    && tsc --noEmit
npx biome check                  # lint/format
```
Plus the manual run appropriate to the phase (browser `bun run dev`, `tauri:dev`, or a deployed-hub smoke).
