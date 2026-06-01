# Backend Refactor — Multi-Server Node Backend

This document describes the `feature/backend-refactor` work: what changed, why,
and where to find it. It compares the branch against `develop`.

**Scope:** 11 commits, ~90 files, +5,145 / −4,730. Plan of record:
[`docs/multi-server-backend-plan.md`](docs/multi-server-backend-plan.md).

---

## TL;DR

Before, the backend was Rust compiled *inside* the Tauri desktop app and ran
in-process — desktop-only, with a fake localStorage stand-in for browser dev.

Now the backend is a standalone **Node/TypeScript server** (Hono on Bun),
deployable three ways from one codebase, and the client can connect to **several
servers at once**, merging all their boards into a single view. The Rust layer
shrinks to a window shell + tray + a supervisor that launches the server as a
local "sidecar".

```
develop:   [ Tauri app  ──in-process──►  Rust backend ]   (desktop only)

branch:    [ Client ]──┬─HTTP/WS─► Node server (desktop sidecar, 127.0.0.1)
                       ├─HTTP/WS─► Node server (self-hosted box)
                       └─HTTP/WS─► Node server (managed cloud)
           one board = all connected servers, merged
```

---

## Why

- **Web + desktop parity** — the same real backend serves a browser, a
  self-hosted box, and the desktop app. No more fake browser stand-in for the
  core flows.
- **Aggregation** — one dashboard can drive multiple machines (e.g. laptop +
  remote build box), each server staying simple and single-tenant.
- **Deployability** — the identical server binary runs as a desktop sidecar,
  a self-hosted process, or a cloud service.

---

## Repo layout (new)

Bun workspaces — a light monorepo:

```
package.json                 # workspaces: ["packages/*"]
packages/
  shared/  @myra/shared      # canonical types + pure domain logic + contract
  server/  @myra/server      # the only backend (one instance per connection)
src/                         # Next.js frontend (stays at root)
  lib/connections/           # ConnectionManager + connection registry
  lib/transport/             # http / browser / tauri transports
  lib/aggregate/             # GlobalId + merge helpers
src-tauri/                   # shrunk to window/tray/sidecar supervision
```

The frontend stays a Next.js static export (`output: "export"`); Tauri keeps
loading `out/`. The server never serves HTML (except the optional self-host
static mode, off by default).

---

## What changed, by area

### 1. Shared package — `@myra/shared`
Canonical `kanban` / `schedule` / `settings` types, the `Store` interface, the
command/event `contract`, and pure domain logic (cards, schedules, settings,
agent prompt/result, command parsing) extracted so the **frontend and server
share one source of truth**. `src/types/*` are now thin re-export shims so the
existing `@/types` importers don't change.

### 2. The Node server — `@myra/server`
Hono on Bun. One instance = one backend.
- `POST /rpc/:cmd` — generic RPC (body = args), mirroring the old `invoke`.
  Three dispatch layers: data CRUD → OS file-open → agent runner.
- `GET /events` — WebSocket push channel (`agent-log-appended`,
  `agent-result-changed`, `schedules-updated`) via an in-process `EventBus`.
- `GET /healthz` — health/status.
- **Agent runner** — port of the Rust `agent.rs`: spawn agents, stream
  stdout/stderr line-by-line to per-run logs, the concurrency **queue**,
  cancel, result-file ingestion. Plus the **scheduler** (with `croner` for cron
  parity) and an FS **watcher** backstop.
- **Store** — `FileStore` keeps the exact Rust on-disk JSON format
  (`board.json` / `schedules.json` / `settings.json`, camelCase, demo-mode
  aware) so data is interchangeable.

### 3. Client connection layer
- **`ConnectionManager`** holds N connections, each with its own `Transport`.
  - `invokeAll` — fan-out reads, merged.
  - `invokeOne` — route a mutation to the owning server.
  - `listenAll` — N WebSockets, demuxed by `connId`.
- **Transports:** `http.ts` (fetch + WS), `browser.ts` (offline localStorage
  fallback — the zero-connection mode), `tauri.ts` (Tauri invoke/listen).
- **GlobalId = `${connId}::${entityId}`** namespaces every card/schedule so ids
  never collide across servers and "which server owns this" is always
  answerable. Cross-server drag-and-drop is disallowed for now.
- Hooks (`use-kanban`, `use-schedules`, `use-settings`, `use-agent-logs`,
  `use-agent-events`) became aggregation-aware: fan-out on load, route on
  mutate, merge on event.

### 4. UI
- **Connections panel** in Settings (add / remove / label servers).
- Per-card origin badge; per-server settings scoping; partial-failure states
  (one server down → only its cards drop out).
- New i18n keys in `en.json` + `fr.json`.

### 5. Desktop (Tauri) — shrunk
- The Node server is compiled to a single self-contained binary
  (`bun build --compile`) and bundled as a Tauri **`externalBin` sidecar**.
- `lib.rs` spawns it on a free `127.0.0.1` port at startup, exposes the port via
  `get_sidecar_port`, and kills the child on exit.
- The local connection becomes HTTP → sidecar.
- **Deleted** the entire Rust command layer (`commands/{kanban,schedule,agent,
  planner}.rs`, `settings.rs`, `scheduler.rs`, `watcher.rs`, `models/*`,
  `demo.rs`, `schedule_store.rs`). Remaining: `lib.rs`, `main.rs`, `tray.rs`.
- OS file-open commands (`open_path`, `open_card_working_dir`) moved into the
  server (`runner/os.ts`) — the local sidecar runs in the user's session.

### 6. Self-host + cloud skeleton (Phase 6)
- `packages/server/Dockerfile` — self-host image (`oven/bun`, workspace
  install, `MYRA_DIR=/data`, port 4319).
- `store/sqlite-store.ts` + `MYRA_STORE=sqlite|file` switch — `bun:sqlite`
  backend for cloud scale (coarse JSON-document rows for now).
- `runner/sandbox-executor.ts` + `MYRA_EXECUTOR=sandbox|local` switch — cloud
  executor skeleton (throws on use; no silent host-fallback).
- Optional `serveStatic('./out')` behind `MYRA_SERVE_STATIC` for single-process
  self-host.

---

## Phases (commit history)

| Phase | Commit | What |
|------|--------|------|
| 1 | `383ab75` | Extract domain logic into `@myra/shared` |
| 2 | `d7d63f6` | Connection seam + transports (single connection) |
| 3a | `0dde60b` | Node backend + HTTP transport — CRUD end-to-end |
| 3b | `586fa3a` | WebSocket events — EventBus + `/events` + HTTP listen |
| 3c | `a53ef74` | Agent runner, scheduler, watcher, planner |
| 4 | `20cf7f8` | Multi-server aggregation — N connections, one board |
| 5a | `2f2f319` | Spawn Node server as Tauri sidecar |
| 5b | `eb3a903` | Retire Rust command layer; OS commands → sidecar |
| 6 | `ac9cc8f` | Self-host + cloud skeleton — sqlite, sandbox, Docker |

(Plus `5a9ac07` base scaffolding and `b59b850` validation skills.)

---

## Environment switches (server)

| Var | Default | Effect |
|-----|---------|--------|
| `PORT` | `4319` | Listen port |
| `MYRA_DIR` | `~/.myra-agents` | Data directory (override) |
| `DEMO` | unset | `1`/`true` → isolated demo data dir |
| `MYRA_STORE` | `file` | `sqlite` → bun:sqlite store |
| `MYRA_EXECUTOR` | `local` | `sandbox` → cloud executor (skeleton) |
| `MYRA_SERVE_STATIC` | unset | `1` serves `./out`, or a custom dir |

---

## Verification status

Type-check + lint gates are green:

- `packages/shared` `tsc --noEmit` → clean
- `packages/server` `tsc --noEmit` → clean
- root (client) `tsc --noEmit` → clean
- `biome check` → clean

**Not yet done:** a live `tauri:dev` run to confirm the sidecar actually spawns
and streams agent output end-to-end (project convention requires a manual run).

---

## Known issues / follow-ups

- **Sidecar fallback degradation** — on desktop, the local connection's
  no-`baseUrl` fallback routes data commands to `tauriTransport`, but Phase 5
  deleted every Rust data handler except `get_sidecar_port`. If the sidecar is
  slow or fails to start, data calls error instead of degrading. Fix: point the
  desktop fallback at `browserTransport` (offline) instead of `tauriTransport`.
- **Settings field mismatch** — TS `AppSettings` carries `defaultAgentId` +
  `theme`/`locale`/`defaultHomePage`; the file store keeps a `defaultAgent`
  mirror for compatibility. Adapted on read; documented, not "fixed".
- **Cloud is a skeleton** — `SandboxExecutor` and per-tenant boundaries are
  stubbed; sqlite store uses coarse JSON-document rows. Real cloud (auth,
  sandbox tech, secrets, per-row tables) is deferred.
- **Cross-server moves** disallowed (move stays within origin server).
- **Auth: Clerk wired; billing still a stub.** Identity is real — Clerk proves
  who you are; the hub verifies the Clerk JWT at `/auth/exchange` and mints its
  own short **session** JWT + a single-use, revocable **refresh** token
  (`packages/hub/src/core/auth.ts`, stores in `cf/{account,refresh}-store.ts`).
  Web signs in in-page; desktop via system browser + `myra://` deep-link through
  the `/auth/desktop/` bridge page. `src/lib/auth/session.ts` owns the client
  session lifecycle; `src/lib/entitlement.ts` reads tier/role/orgId from the
  session claims. **Still stubbed:** `tier` is set manually on the account record
  (KV `acct:<userId>`) — no billing/Stripe webhook yet; `role`/`orgId` come from
  Clerk org claims but admin-sees-all-org enforcement is a hub follow-up (DO is
  per-`userId`). `NEXT_PUBLIC_MYRA_TIER`/`_ROLE`/`_ORG_ID` remain env fallbacks
  for local/desktop testing when there's no session.
