# Myra Agents

> UI based on the [studio admin](https://next-shadcn-admin-dashboard.vercel.app) dashboard template.

A desktop **Kanban board that runs CLI coding agents**. Each card carries a prompt; launch it and Myra Agents spawns a configured agent (OpenCode / GitHub Copilot CLI / Claude / your own binary) in headless mode, streams its output live onto the card, and moves the card through the workflow as the agent reports progress. Schedules can auto-create and launch cards on a cron/daily/weekly/interval/once cadence.

> **Stack:** Next.js 16 (App Router, React 19, TypeScript) + Tauri v2 (Rust) · **Package manager:** bun · **Lint/format:** biome

---

## Why Myra Agents?

Coding agents are powerful but awkward to operate at scale: you babysit a terminal per run, lose history, and can't easily schedule "run this prompt on this repo every morning". Myra Agents wraps that with:

- A **Kanban board** where each card is a unit of agent work (prompt + tags + target agent + working dir).
- A lifecycle: **Draft → To Do → In Progress → Waiting Feedback → Awaiting Review → Done** (plus Trash), driven by what the agent reports.
- **Live, streamed logs** per run, plus a logs/history view with duration and (when reported) token/cost stats.
- **Schedules** that materialize cards and launch them automatically, even via the system tray.
- A **run queue** so you cap how many agents run at once.

---

## Features

- **Per-card agent + working directory** — pick which agent preset runs each card and where; falls back to the app default.
- **Configurable agent presets** — name, binary, args template (`{prompt}` placeholder), default working dir. Configured in Settings; not hard-coded.
- **Run queue** — `maxConcurrentAgents` limit (0 = unlimited); launches over the limit are queued and dequeued as agents finish.
- **One-click relaunch** — re-run a card; prior revision notes are carried into the new run.
- **Run artifacts & logs** — per-run log files and archived results, openable from the logs view; live tail on in-progress cards.
- **Cost / duration stats** — per run and aggregated per card.
- **Schedules** — once / daily / weekly / interval / cron, with a planner view.
- **Tray app** — close-to-tray, runs schedules in the background.
- **i18n** — English + French.

---

## Installation

Myra Agents is three deployable pieces plus a shared library. What you install
depends on whether you're an **end user** (run the board, add machines) or an
**admin** (stand up the shared infrastructure).

### Topology

```
   ┌─────────────────┐         ┌──────────────────┐        ┌──────────────────────┐
   │  Desktop app     │  wss/   │  Hub (relay)      │  wss/  │  Instances            │
   │  (dashboard)     │◀──────▶│  packages/hub     │◀──────▶│  myra-server          │
   │  USER installs   │  https  │  Cloudflare Worker│  out   │  packages/server      │
   │                  │         │  ADMIN deploys    │        │  on each machine      │
   └─────────────────┘         └──────────────────┘        │  USER pairs (1-liner) │
                                                             └──────────────────────┘
```

The **dashboard** logs into a **hub**; each remote **instance** dials the hub
outbound (works behind NAT). Instances appear on the dashboard as board origins.
No hub? The desktop app still runs fully **local** against its own bundled
server sidecar — skip everything hub-related below.

### Components

| Package | What it is | Who installs it | How |
|---|---|---|---|
| Desktop app (repo root) | Next.js + Tauri dashboard | **User** | download release / `bun run tauri:build` |
| `packages/server` | `myra-server` instance backend (self-contained binary) | **User** (per machine) | install one-liner |
| `packages/hub` | Cloudflare Worker relay (`UserHub` Durable Object) | **Admin** | Wrangler deploy |
| `packages/shared` | Shared TS types/protocol | — | not installed standalone; a workspace dep of the others |

---

### For users

**1 — Install the desktop dashboard.** Download the installer for your OS from
the project Releases (`.msi`/`.nsis` on Windows, `.dmg`/app bundle on macOS), or
build it yourself from a checkout:

```bash
bun install
bun run tauri:build      # bundle in src-tauri/target/release/bundle/
```

Launch it. Out of the box it runs **local only** — your board lives in
`~/.myra-agents/`, agents run on this machine, no hub needed.

**2 — (Optional) Connect to a hub.** To gather machines under one login, go to
**Settings → Connections → Hubs**, click **Add hub**, enter the hub URL + your
user. This stores a session token; the dashboard now talks to the hub.

**3 — (Optional) Add a remote instance.** In the same panel, click **Pair
instance** on a hub. It mints a one-time code and shows a copy-paste install
command (toggle macOS-Linux / Windows). On the machine you want to add, run it:

```bash
# macOS / Linux
curl -sSf https://<hub-host>/install-remote.sh | MYRA_HUB_URL=<hub> CODE=<code> sh

# Windows (PowerShell)
$env:MYRA_HUB_URL="<hub>"; $env:CODE="<code>"; iwr https://<hub-host>/install-remote.ps1 | iex
```

That one command downloads the right `myra-server` binary, verifies its
checksum, enrolls with the code, and installs a **per-user service** (systemd
user unit / launchd LaunchAgent / Task Scheduler) so it survives logout and
reboot — no root/admin. The instance dials the hub and shows up on your board.
Re-run the same command anytime to update the binary (idempotent).

> First run of an unsigned downloaded binary: macOS Gatekeeper is cleared by the
> script (`xattr`); Windows SmartScreen may warn once. Signing/notarization is
> tracked separately.

**Manage an instance** (on the machine, once installed):

```bash
myra-server status              # enrollment + running state
myra-server unenroll            # drop the hub credential
myra-server uninstall-service   # stop + remove the service
```

---

### For admins

**1 — Deploy the hub.** The hub is a Cloudflare Worker + Durable Object in
`packages/hub`. Full runbook (Node 22, Wrangler login, KV namespace for pairing
codes, the `MYRA_HUB_SECRET` signing secret, deploy, smoke test) is in
[`docs/hub-deploy.md`](docs/hub-deploy.md). Short version:

```bash
cd packages/hub
nvm use 22                                       # Wrangler needs Node ≥ 22
bunx wrangler login
bunx wrangler kv namespace create PAIRING        # paste id into wrangler.toml
openssl rand -hex 32 | bunx wrangler secret put MYRA_HUB_SECRET
bunx wrangler deploy                             # → prints the hub URL
```

Hand the printed hub URL to your users (step 2 above). In production leave dev
login **off** and wire OIDC / Cloudflare Access — see the runbook.

**2 — Publish the instance binaries.** Users' install one-liner pulls
`myra-server` from GitHub Releases. The release CI
([`.github/workflows/release-server.yml`](.github/workflows/release-server.yml))
builds all five targets (Linux x64/arm64, macOS x64/arm64, Windows x64) plus
`.sha256` checksums when you push a `v*` tag:

```bash
git tag v0.2.0 && git push origin v0.2.0       # → builds + attaches release assets
```

The install scripts (`scripts/install-remote.{sh,ps1}`) fetch from
`releases/latest/download/`. Host the scripts where users can `curl` them (the
hub host, or GitHub raw) and override the source repo with `MYRA_REPO` /
`MYRA_RELEASE` env vars if needed.

---

## Getting started (developers)

> The fastest path is the in-repo **`onboard` skill**: if you use Claude Code, just say **"onboard me"** (or `/onboard`) and it walks you through everything below interactively — prerequisites, install, running, an architecture tour, conventions, the verification gates, and your first PR. See `.claude/skills/onboard/SKILL.md`.

### Prerequisites

- [**bun**](https://bun.sh) ≥ 1.3
- [**Rust**](https://rustup.rs) (stable toolchain) + [**Tauri OS prerequisites**](https://tauri.app/start/prerequisites/) (macOS: Xcode CLT; Linux: webkit2gtk + build tools; Windows: WebView2 + MSVC)
- **Node** (for `npx tsc` and some tooling)

### Install & run

```bash
bun install

bun run tauri:dev     # full desktop app: Tauri (Rust) + Next dev server on :1420
bun run tauri:demo    # same, DEMO=1 → isolated ~/.myra-agents-demo data, pre-seeded board
bun run dev           # frontend ONLY in a browser (localStorage dev backend; no agents)
bun run tauri:build   # production bundle
```

First `tauri:dev` build is slow (it compiles Tauri/Rust). `tauri:demo` is the best first look — it seeds a card in every column and one schedule of each kind.

### Verification gates

No unit-test suite — verify with all three plus a manual run (husky + lint-staged also run biome on commit):

```bash
npx tsc --noEmit                 # frontend types
cd src-tauri && cargo check      # Rust backend
npx biome check                  # lint/format (--write to autofix)
```

---

## Architecture (one-paragraph version)

The **Tauri (Rust) backend** in `src-tauri/src/` keeps a tray process alive, owns singleton state, and exposes every feature as a `#[tauri::command]` registered in `lib.rs`. `commands/agent.rs` spawns agents, enforces the run queue, and streams stdout/stderr to per-run log files; `commands/kanban.rs` owns card CRUD and the `board.json` store; `watcher.rs` watches `agent-results/` and turns an agent's result file into a card status change; `scheduler.rs` ticks every 30s and fires due schedules. The **Next.js frontend** in `src/` renders the board (`components/kanban/`, `@dnd-kit` drag-and-drop), with one hook per concern in `hooks/` and routes in `app/(main)/`. All backend calls go through `src/lib/tauri.ts` (`invoke`/`listen`); live updates are push events (`agent-log-appended`, `agent-result-changed`, `schedules-updated`). In a plain browser, `src/lib/browser-backend.ts` stands in for the desktop backend. The full reference lives in [`CLAUDE.md`](./CLAUDE.md).

### Where things are stored

All under `~/.myra-agents/` (or `~/.myra-agents-demo/` when `DEMO=1`):

| Path | What |
|---|---|
| `board.json` | All cards |
| `schedules.json` | Scheduled tasks |
| `settings.json` | Agent presets, default agent, max concurrency |
| `agent-runs/{runId}.log` | Streamed run output + archived results |
| `agent-results/{cardId}.json` | Transient agent→app result handoff (watched, then archived) |

### Agent result protocol

When an agent finishes it writes `~/.myra-agents/agent-results/{cardId}.json`:

```json
{ "cardId": "…", "status": "awaiting_review", "result": "summary" }
{ "cardId": "…", "status": "waiting_feedback", "question": "…" }
{ "cardId": "…", "status": "failed", "error": "…" }
```

Optional `"tokens"` (int) and `"cost"` (USD float) are recorded on the run. The watcher transitions the card accordingly.

---

## Contributing

- Branch off **`develop`** (the integration branch; `main` is release). Open PRs against `develop`.
- Check **`TODO.md`** for the backlog (`[ ]` todo · `[~]` in progress · `[x]` done) for starter tasks.
- Conventions that bite (full list in `CLAUDE.md`):
  - **i18n**: add every user-facing string to **both** `src/messages/en.json` and `src/messages/fr.json` via `next-intl`.
  - **Rust↔TS payloads**: Rust uses `#[serde(rename_all = "camelCase")]`; mirror field names in `src/types/`. Adding a model field means updating every struct literal.
  - **Browser dev backend**: changing a Tauri command's shape? Update `src/lib/browser-backend.ts` too.
  - **Concurrency**: launch agents via `request_launch`, not `spawn_agent_for_card`, so the queue is respected.
- Run the three verification gates + a manual smoke test before opening a PR.

New here? Run the **`onboard`** skill (`/onboard` in Claude Code) for a guided walkthrough.
