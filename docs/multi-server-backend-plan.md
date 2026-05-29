# Myra Agents — Multi-Server Node Backend (aggregated client + desktop sidecar + self-host + cloud)

## Context

Today the "backend" is Rust compiled into the Tauri desktop binary, running in-process. There is no server. `bun run dev` only works because `src/lib/browser-backend.ts` fakes CRUD in localStorage; agent runs are desktop-only.

Goal: web + mobile + desktop all talk to real backends, and **one client connects to several servers at once** — a centralized app that **aggregates** multiple servers' boards into a single view. Each backend is the *same* Node server, deployable three ways:
- **Desktop sidecar** — Tauri spawns the server on `127.0.0.1`; agents run on the user's machine/repos. Offline.
- **Self-hosted** — user runs the server on their own box; clients point at it.
- **Managed cloud** — server clones repos into sandboxes and runs agents server-side.

**Decisions locked:** Node/TS is the *only* backend (Rust command layer retires). Full build. Auth/multi-user **deferred** (each server single-tenant for now). **Multi-server = aggregated from the start**: all connected servers' cards merged into one board, each tagged by origin server; N live connections concurrently.

## The defining constraint: aggregation lives in the CLIENT

Each server stays standalone/single-tenant and **knows nothing** about other servers or aggregation. The client holds N connections, fans out reads, merges results, routes each mutation back to the owning server, and keeps N WebSockets open. This keeps servers simple and lets any mix of sidecar/self-host/cloud be combined.

### Connection model
```ts
interface Connection {
  id: string;          // stable local id (e.g. "local", "uuid")
  label: string;       // user-facing name
  baseUrl: string;     // http(s)://host:port  ("" / sentinel = desktop sidecar)
  kind: "sidecar" | "remote";
  auth?: { token?: string };   // unused now (auth deferred); reserved
  status: "connected" | "connecting" | "error" | "disabled";
}
```
Registry persisted in `~/.myra-agents/connections.json` (desktop, read by Rust supervisor too) and mirrored to `localStorage` key `myra.connections` (web/mobile). The desktop sidecar is just the connection with `id:"local"`, `kind:"sidecar"`.

### Global entity identity
Cards/schedules are unique only *within* a server. The aggregated client namespaces everything by connection: a **GlobalId = `${connId}::${entityId}`**. The board renders GlobalIds; when mutating, the client splits off `connId` to pick the transport and sends the bare `entityId`. This avoids id collisions across servers and makes "which server owns this card" always answerable. Drag-and-drop across servers is **disallowed in phase 1** (a move stays within its origin server) — cross-server move = copy+delete, deferred.

## Architecture at a glance

- Frontend stays Next.js static export (`output: "export"`), consumed by Tauri `frontendDist: "../out"` and by web/mobile as static assets.
- New Node/TS server (Hono on Bun) per backend: serves `/rpc/:cmd`, `/events` (WS), `/healthz`. Never HTML. Identical binary for sidecar/self-host/cloud.
- Tauri shrinks to: window controls, tray, `open_path`/`open_card_working_dir`, sidecar supervision, `get_sidecar_port`.
- Client gains a **ConnectionManager**: `Map<connId, Transport>` + a merge layer. The single seam `src/lib/tauri.ts` is replaced by connection-aware `invoke(connId, cmd, args)` / `listen(connId, event, cb)` plus aggregation helpers. The 9 importing hooks/components change to be connection-aware (this is the main new cost vs the single-server plan).

> The work is split into **6 phases** — see "Phased migration" below. P1–P2 are pure refactors; P3 proves one real server end-to-end; P4 adds multi-server aggregation; P5 packages the desktop sidecar; P6 adds self-host + cloud.

## Repo layout — Bun workspaces (light monorepo)

```
package.json            # workspaces: ["packages/*"]
packages/
  shared/   @myra/shared    types + pure domain logic + contract (server + client share)
    src/types/              # canonical kanban/schedule/settings (src/types/* become re-export shims)
    src/contract.ts         # command names, arg/return types, event names+payloads
    src/store.ts            # Store interface
    src/domain/             # pure fns extracted from browser-backend.ts (storage-injected)
  server/   @myra/server    the only backend (one instance per connection)
    src/index.ts app.ts routes/ realtime/ store/ runner/ queue.ts scheduler.ts watcher.ts
src/                    # Next frontend stays at root
  lib/connections/          # NEW: ConnectionManager, per-conn Transport, registry persistence
  lib/transport/            # http.ts (fetch+WS), browser.ts (offline localStorage), tauri-os.ts (file-open only)
  lib/aggregate/            # merge helpers: fan-out reads, GlobalId split/join, demuxed events
src-tauri/             # shrinks to window/tray/file-open + sidecar supervision (one local sidecar)
```

Frontend stays at root `src/` to minimize churn to `next.config.mjs`, `@/*` alias, `frontendDist`. Only `src/types/*` moves (re-export shims left behind).

## Connection layer (the new core)

```ts
interface Transport {                       // one per connection
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, cb: (e: { connId: string; payload: T }) => void): Promise<UnlistenFn>;
}
class ConnectionManager {
  list(): Connection[];
  add(c): void; remove(id): void; update(id, patch): void;   // persists registry
  transport(id): Transport;
  // aggregation:
  invokeAll<T>(cmd, args?): Promise<{ connId: string; data?: T; error?: Error }[]>; // fan-out
  invokeOne<T>(connId, cmd, args?): Promise<T>;                                       // routed
  listenAll<T>(event, cb): Promise<UnlistenFn>;  // subscribes across all connections, demuxes by connId
}
```

- **Transport impls:** `http.ts` (fetch to `baseUrl/rpc/:cmd` + WS to `baseUrl/events`), `browser.ts` (offline localStorage stand-in — the connection-less fallback when zero servers configured / plain `next dev`), `tauri-os.ts` (NOT a data backend — only `open_path`/`open_card_working_dir` via Tauri, used regardless of which server owns the card).
- **Per-connection lifecycle:** each connection opens its own WS, with reconnect/backoff and a `status` the UI shows. A failing connection degrades gracefully — its cards drop out, others stay live (partial failure is a first-class state).
- **Registry persistence:** `connections.json` + localStorage. Desktop seeds `id:"local"` sidecar automatically; user adds remotes in Settings → Connections.

## Aggregation layer

- **Reads** (`get_cards`, `list_schedules`): `invokeAll` → tag each result with `connId` → map ids to GlobalIds → concat. `get_settings` is **per-connection** (each server has its own presets/concurrency) — settings UI is scoped to a selected connection, NOT merged.
- **Mutations** (`add/update/move/...`): client knows the card's `connId` (from its GlobalId) → `invokeOne(connId, ...)`. `add_card` needs a **target connection** chosen in the new-card modal (defaults to a user-set "primary" connection).
- **Events:** `listenAll` keeps N subscriptions; every event carries `connId`; `use-agent-logs`/`use-agent-events` key their state by GlobalId. Card update events upsert by GlobalId.
- **Board UI:** each card shows a small origin-server badge; columns merge across servers; optional per-server filter/grouping. A connection switcher in the sidebar toggles visibility per server (all-on = full aggregate).
- **Hooks change:** `use-kanban` (and schedules/settings/logs) become aggregation-aware — fan-out on load, route on mutate, merge on event. This is the biggest delta from the single-server design.

## Node server (per backend — unchanged by multi-server)

**Framework: Hono on Bun.** Rejected: Next API routes (breaks static export, couples runner to Next lifecycle), Express (weak WS/types), Fastify (heavier). Hono is tiny, TS-first, runs on Bun (matches toolchain), compiles to a single binary via `bun build --compile` for the sidecar. Long-lived stateful process (queue, scheduler, WS, child procs).

**Routes:** generic RPC `POST /rpc/:cmd` body=args → `{ok,data}|{ok,error}` (mirrors `invoke`; browser-backend's switch is already this dispatcher). `cmd` whitelist + zod validation from `@myra/shared/contract.ts`. `GET /healthz` (supervisor + connection status checks). `GET /events` WS.

**Store:** keep JSON files under the server's data dir now (exact Rust format; honor `DEMO=1`). `Store` interface; `file-store.ts` with `fs` + in-process async mutex on `board.json` (server is sole writer → removes file-watch-IPC race). Cloud adds `sqlite-store.ts` (`bun:sqlite`) via `MYRA_STORE=sqlite`. Reuse logic by lifting browser-backend pure fns into `@myra/shared/domain/*` over `Store`; browser offline transport = domain + LocalStorageStore, server = domain + FileStore (one code path).

**Events: WebSocket** (`/events`). Over SSE: dominant traffic is high-frequency `agent-log-appended` fan-in; SSE hits the 6-conn/origin cap (worse here — N servers!) + proxy buffering. WS = one multiplexed channel per connection, works through Tauri webview/browsers/mobile. In-process typed `EventBus`; `ws.ts` forwards `{event,payload}` frames; client wraps each with its `connId`. SSE fallback `/events/sse` for restrictive proxies. Coalesce log frames ≤30ms (client caps 500 lines/card).

## Agent runner (per server)

```ts
interface AgentJob { cardId; runId; prompt; preset; workingDir; resultPath }
interface RunHandle { cancel(): Promise<void> }
interface AgentExecutor { run(job, hooks:{ onLine(stream,line); onExit(code) }): Promise<RunHandle> }
```
- **LocalProcessExecutor** (sidecar+self-host): port of `agent.rs`. `Bun.spawn`/`child_process.spawn(binary, argsArray, {cwd, stdio:piped})`. Port arg-template parsing (`split_command_line`/`quote_windows_arg`/`build_agent_command`, agent.rs:35-139) into `@myra/shared/domain/command.ts`. Line-buffered stdout/stderr → `onLine` → append `agent-runs/{runId}.log` + bus emit. `cancel()` kills child (port `taskkill /T /F` Windows). Running map `Map<cardId,RunHandle>`.
- **SandboxExecutor** (cloud): same interface — provision container, `git clone`, run inside, stream stdout via `onLine`, read result file from container on exit. Tech deferred. `MYRA_EXECUTOR=local|sandbox` (default local).

**Result protocol:** agent still writes `agent-results/{cardId}.json` (prompt footer instructs — keep agent contract), but the **executor `onExit` reads the file** and calls shared `applyResult(card,parsed)` (canonical path); `watcher.ts` (chokidar) is a local backstop. Transitions ported from watcher.rs:123-145; archive to `agent-runs/` with timestamp; emit `agent-result-changed`. Short read-retry on exit. Extract `applyResult()`+`buildPrompt()` into `@myra/shared/domain/agent.ts`.

**Queue** (`queue.ts`): port agent.rs:236-289 — `maxConcurrentAgents` per server (0=unlimited), FIFO, `agentQueued` flag, `requestLaunch`, `dequeueAndSpawn` on exit. Single-threaded → no mutex.

**Scheduler** (`scheduler.ts`): port scheduler.rs — `setInterval` 30s, fire due via `materializeCardForSchedule`+`requestLaunch`, recompute `nextRunAt`. **Add cron evaluator (`croner`)** — TS `computeNextRun` returns undefined for `cron`; without it cron schedules never fire. Respect demo mode. Each server runs its own scheduler.

**Planner:** port `plan_day` into `routes/planner.ts`.

## Tauri changes

**Delete:** `commands/{kanban,schedule,agent(except file-open),planner}.rs`, `settings.rs` (command parts), `schedule_store.rs`, `scheduler.rs`, `watcher.rs`, `models/*`, `demo.rs`, and most of the `invoke_handler` list.

**Keep:** window controls, tray, CloseRequested→hide-to-tray, `open_path`/`open_card_working_dir` (client resolves dir from the card it holds, regardless of owning server, and calls `open_path`), new `get_sidecar_port`.

**Sidecar:** `bun build --compile --target=bun packages/server/src/index.ts --outfile myra-server` → single self-contained binary. Per-platform binaries as Tauri `externalBin` (triple-suffix naming). Supervise via `tauri-plugin-shell` `Command::new_sidecar` in `lib.rs` setup → spawn with `PORT/MYRA_DIR/DEMO`, poll `/healthz`, expose port as the `id:"local"` connection. Kill child on window close / `RunEvent::Exit`. If the user has no local connection (pure remote use), the sidecar can be skipped. `tauri:dev` `beforeDevCommand` runs `bun --watch` server + `next dev`. `frontendDist:"../out"` unchanged.

## next.config — stays static export

Keep `output: "export"`. Tauri keeps consuming `out/`. Web = static CDN of `out/` + connections configured at runtime (not baked — multi-server is dynamic). Node server separate (never serves HTML). Do NOT move to `standalone`. Optional Hono `serveStatic('out/')` for self-host single-process convenience (off by default).

## Phased migration

Six phases. Each ends with a **shippable, working app** (never big-bang), its own PR(s), and explicit exit criteria. Phases 1–2 are pure refactors with zero user-visible change (safe to land anytime). Phase 4 (aggregation) is the highest-risk and gated behind a working single-server stack from Phase 3.

Order rationale: extract shared logic → insert the connection seam → prove ONE real server end-to-end (CRUD, then events, then agents) → only THEN go multi-server → then package into desktop → then cloud/self-host. The app keeps working with the offline localStorage transport until a real server exists.

---

### Phase 1 — Foundation: shared package + domain extraction
*Pure refactor, no behavior change, no server yet.*
- Bun workspace; create `packages/shared` (`@myra/shared`).
- Move `src/types/{kanban,schedule,settings}.ts` into shared; leave re-export shims at `src/types/*` so the 18 `@/types` importers don't change.
- Define `Store` interface + `contract.ts` (command names, arg/return types, event names+payloads — single source of truth).
- Extract `browser-backend.ts` pure logic into `@myra/shared/domain/*` (cards, schedules, settings) parameterized over `Store`. Rewrite `browser-backend.ts` as `LocalStorageStore` + domain dispatch.
- **Exit:** `bun run dev` + `tauri:dev` behave identically; `tsc --noEmit` + `biome check` green; board CRUD works in browser exactly as today.

### Phase 2 — Connection seam (single connection)
*Pure refactor; the abstraction that everything else hangs off.*
- Introduce `ConnectionManager` + `Transport` interface in `src/lib/connections/`.
- Implementations: `browser.ts` (offline localStorage, wraps Phase-1 domain), `tauri-os.ts` (file-open only). HTTP transport stubbed (lands Phase 3).
- Replace `src/lib/tauri.ts` internals with a one-connection manager. Public `invoke`/`listen` still resolve, hooks unchanged this phase.
- **Exit:** both run modes unchanged; single connection flows through the manager; types green.

### Phase 3 — One real Node server, end-to-end
*First real backend. Prove the whole vertical slice on ONE server before multiplying it.*
- **3a CRUD/HTTP:** build `packages/server` (Hono on Bun), `POST /rpc/:cmd` + `/healthz`, `FileStore` reusing `@myra/shared/domain`. `HttpTransport.invoke`. Point one connection at it. *Verify:* browser → Node: card/settings/schedule CRUD round-trips to JSON; `board.json` matches Tauri format.
- **3b WS events:** `/events` WS + in-process `EventBus` + `HttpTransport.listen` (reconnect/backoff). *Verify:* emit reaches a hook; survives server restart.
- **3c Agent runner:** port `agent.rs` → `LocalProcessExecutor` + `queue.ts`; `watcher.rs` → in-process watcher + `applyResult`; `scheduler.rs` → `scheduler.ts` (+`croner` for cron parity); `plan_day` → `routes/planner.ts`. Emit the 3 events.
- **Exit:** with a browser pointed at the Node server, launch a real agent → live logs stream into the card modal, card transitions on result, cancel kills the process, a due schedule fires. Behavior matches today's `tauri:dev`.

### Phase 4 — Multi-server aggregation *(highest risk)*
*Turn the one connection into N, merged into one board.*
- ConnectionManager holds N; `GlobalId = connId::entityId` namespacing end-to-end.
- `invokeAll` (fan-out reads), `invokeOne` (routed mutations), `listenAll` (N WS, demuxed by connId).
- Hooks become aggregation-aware (`use-kanban`, `use-schedules`, `use-settings`, `use-agent-logs`, `use-agent-events`).
- UI: Settings→Connections (add/remove/label/status), per-card origin badge, connection switcher/filter, target-connection picker in new-card modal, per-server settings scoping, partial-failure states.
- Cross-server DnD disallowed (move stays in origin).
- **Exit:** two Node servers on different ports merge into one board; mutations route to the right server; killing one degrades only its cards; logs/results demux correctly.

### Phase 5 — Desktop packaging (sidecar = local connection)
- `bun build --compile` the server → single binary; Tauri `externalBin` + `tauri-plugin-shell` supervision in `lib.rs` (spawn on start, `/healthz` poll, kill on exit); expose port as the `id:"local"` connection.
- Delete dead Rust modules (kanban/schedule/agent-data/planner/scheduler/watcher/models/demo); keep window/tray/file-open/`get_sidecar_port`.
- Desktop seeds the local sidecar connection and lets the user add remotes.
- **Exit:** `tauri:dev`/`build` spawns the sidecar, it appears as one connection alongside remotes, agents stream into the desktop UI, quitting kills the sidecar, file-open works.

### Phase 6 — Self-host + cloud skeleton + drop legacy
- Dockerfile for the server (self-host); `MYRA_STORE=sqlite` (`bun:sqlite`); `SandboxExecutor` skeleton behind `MYRA_EXECUTOR=sandbox` (clone+container; internals deferred); optional Hono `serveStatic('out/')`.
- Remove remaining `@tauri-apps/api` data usage + any legacy transport.
- **Exit:** `docker run` the server, add it as a connection from desktop/web, full flow works; cloud executor stubbed and selectable.

Browser offline transport remains the zero-connection fallback throughout — app never breaks.

### Dependency graph
```
P1 → P2 → P3(3a→3b→3c) → P4 → P5 → P6
```
P1/P2 are independently mergeable (no behavior change). P3 must complete before P4 (don't aggregate an unproven server). P5 depends on P4 (sidecar is just one connection). P6 is additive.

## Critical files

- `src/lib/tauri.ts` — single client seam → replaced by ConnectionManager + per-conn transport
- `src/lib/browser-backend.ts` — TS CRUD/schedule logic → extract to `@myra/shared/domain`, reused by server + offline transport
- `src/hooks/use-kanban.ts` (+ use-schedules/use-settings/use-agent-logs/use-agent-events) — become aggregation-aware
- `src-tauri/src/commands/agent.rs` — launch/cancel/queue/log-streaming → LocalProcessExecutor + queue
- `src-tauri/src/watcher.rs` — result protocol + transitions → in-process watcher/applyResult
- `src-tauri/tauri.conf.json` + `src-tauri/src/lib.rs` — sidecar externalBin + supervision; delete dead commands
- `next.config.mjs` — stays static export (no change)

## Risks / unknowns

- **Aggregation complexity (the big one):** GlobalId namespacing must thread through every hook, the DnD layer, logs, and event handlers. Partial failure (one server down) must be graceful everywhere. Highest-risk area — Phase 4 is the make-or-break.
- **N WebSockets:** desktop webview + browsers must hold one WS per connection; reconnect/backoff per connection; mobile WebViews limit concurrent sockets. Mitigate: lazy-connect only enabled connections; status UI.
- **Per-server settings vs global UI:** settings/presets/concurrency are per-server, not merged — UI must scope to a chosen connection or users will be confused which server they're editing.
- **Cross-server card moves:** disallowed phase 1 (move stays in origin). Copy+delete semantics deferred.
- **Auth for remote/managed servers:** connecting to someone else's server needs auth (token in `Connection.auth`) — reserved in the model but deferred. Self-host/sidecar need none now.
- **Bun-compile sidecar:** ~50-90MB per-platform binaries; cross-compile matrix; `externalBin` triple-suffix must match exactly or bundling fails silently. Verify `new_sidecar` resolution early.
- **WS/CSP:** `csp:null` now; future hardening must allowlist `connect-src` for `ws://127.0.0.1:*` AND every remote `wss://` origin. Mobile blocks mixed content → remotes must be `wss`/`https`.
- **Cloud file-store concurrency:** single `board.json` won't survive multi-tenant cloud → SQLite at Phase 6; tenant boundary deferred with auth.
- **Sandbox tech (cloud):** Docker vs Firecracker/gVisor vs hosted API — defer; `SandboxExecutor` isolates the choice. Repo clone needs git creds.
- **Agent API keys in cloud:** locally from user shell env; cloud injects per-run into sandbox → secrets store + per-user scoping. Blocked on auth (deferred); server-level env var acceptable for now.
- **Cron parity:** add `croner` or cron schedules never fire.
