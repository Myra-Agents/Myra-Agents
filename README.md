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
