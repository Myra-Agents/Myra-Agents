# Myra Agents — Claude Code Instructions

Myra Agents is a desktop app: a **Kanban board that runs CLI coding agents**. Each card carries a prompt; launching it spawns a configured agent binary (opencode / copilot / claude / custom) in headless mode and streams its output back to the board. Cards flow Draft → Todo → In Progress → Waiting Feedback → Awaiting Review → Done, with a Trash lane. Schedules can auto-materialize cards and launch them on a cron/daily/weekly/interval/once basis.

Stack: **Next.js 16 (App Router, React 19, TypeScript) frontend + Tauri v2 (Rust) desktop backend**. Package manager is **bun**; lint/format is **biome**. There is no unit-test project — verification is type-check + cargo check + a manual run.

## Build And Run

```bash
bun install
bun run tauri:dev      # Tauri shell + Next dev server (port 1420)
bun run tauri:demo     # same, with DEMO=1 (isolated demo data + seed)
bun run tauri:build    # production bundle (targets: msi, nsis)
```

Frontend-only (no Rust backend, browser dev backend kicks in):

```bash
bun run dev            # next dev -p 1420
```

Verification gates (run before declaring done):

```bash
npx tsc --noEmit                 # frontend types
cd src-tauri && cargo check      # Rust backend
npx biome check                  # lint/format (use --write to fix)
```

`next.config` does a static export to `out/`, which Tauri loads as `frontendDist`. App identifier `com.myra-agents.app`, product name "Myra Agents". The window is frameless (`decorations: false`, `transparent: true`) — window controls live in `src/app/(main)/_components/window-controls.tsx`. Closing the window hides to the tray instead of quitting (see `on_window_event` in `lib.rs`).

## Architecture

### Backend (`src-tauri/src/`)

Entry: `main.rs` → `lib.rs::run()`. `lib.rs` builds the Tauri app, manages singleton state (`AgentProcesses`, `TrayState`), inits the tray, the filesystem watcher, and the scheduler, and registers every `#[tauri::command]` in one `generate_handler!` block. **Any new command must be added there.**

- `commands/kanban.rs` — card CRUD, ordering (fractional `position` f64), trash/restore, revision notes, feedback answers. Owns `myra_agents_dir()` and `load_cards`/`save_cards`.
- `commands/agent.rs` — spawns agents, streams stdout/stderr to per-run log files, the **run queue** (concurrency limit), cancel, run-log + artifact reads. Holds `AgentProcesses { pids, queue }`.
- `commands/schedule.rs` — schedule CRUD, `trigger_schedule_now`, `materialize_card_for_schedule`, history purge.
- `commands/planner.rs` — `plan_day` (day planning helper).
- `settings.rs` — `Settings { default_agent, agents: Vec<AgentPreset>, max_concurrent_agents }`, load/save, `resolve_agent_preset`.
- `watcher.rs` — debounced FS watcher on `agent-results/`; parses agent result files and transitions cards (see protocol below).
- `scheduler.rs` — 30s tick loop; fires due schedules via `request_launch` (respects the queue).
- `tray.rs`, `demo.rs`, `schedule_store.rs`, `models/` (`kanban_card.rs`, `scheduled_task.rs`).

### Frontend (`src/`)

- `app/(main)/` routes: `kanban`, `schedules`, `planner`, `logs`, `settings` (plus `_components/` for sidebar + window controls).
- `hooks/` — one hook per concern: `use-kanban`, `use-schedules`, `use-settings`, `use-card-templates`, `use-column-preferences`, `use-agent-events`, `use-agent-logs`, `use-planner`, `use-theme`.
- `components/kanban/` — board, column, card, card-modal, feedback-modal, trash-zone.
- `components/ui/` — shadcn-style primitives. `lib/`, `types/`, `i18n/`, `stores/`, `config/`.
- Drag-and-drop via `@dnd-kit`. State is local React + hooks (plus a zustand preferences store). Toasts via `sonner`.

### Frontend ↔ backend bridge

- All backend calls go through `src/lib/tauri.ts` `invoke()`/`listen()` wrappers. In a plain browser (no Tauri) `invoke` throws `[Dev Mode]…`; `src/lib/browser-backend.ts` provides a localStorage-backed stand-in for the kanban/schedule/settings commands so the UI is usable in `bun run dev`. **When you add or change a Tauri command's shape, update `browser-backend.ts` to match.**
- Live updates are push-based Tauri events, not polling:
  - `agent-log-appended` — one stdout/stderr line (consumed by `use-agent-logs` into a `Map<cardId, string[]>`).
  - `agent-result-changed` — a full updated card (consumed by `use-agent-events`, fed to `upsertCard`).
  - `schedules-updated` — schedules changed on disk.

## Agent Run Lifecycle

1. `launch_agent` (or the scheduler / `trigger_schedule_now`) calls `request_launch`. If running agents < `max_concurrent_agents` (0 = unlimited) it spawns immediately; otherwise the card id is pushed to `AgentProcesses.queue` and the card is marked `agent_queued`.
2. `spawn_agent_for_card` resolves the preset, builds the prompt (revision notes prepended + result-protocol footer), resolves the working directory (**priority: explicit arg → card `working_dir` → preset `working_dir` → home**), validates it exists, then spawns `binary args_template` with `{prompt}` substituted. stdout/stderr stream line-by-line to `agent-runs/{runId}.log` and emit `agent-log-appended`.
3. The agent signals completion by writing `agent-results/{cardId}.json`. `watcher.rs` parses it and moves the card:
   - `awaiting_review` → Awaiting Review (with `result`)
   - `waiting_feedback` → Waiting Feedback (with `question`)
   - `failed` → back to Todo (with `error`)
   - Optional `tokens` (int) and `cost` (USD float) are recorded on the `AgentRun`.
   The result file is then archived into `agent-runs/`.
4. When the process exits, the waiter thread frees the PID slot and `dequeue_and_spawn` starts the next queued card.

## Data & Storage

All persisted under `~/.myra-agents/` (or `~/.myra-agents-demo/` when `DEMO=1`):

- `board.json` — cards (`Vec<KanbanCard>`).
- `schedules.json` — scheduled tasks.
- `settings.json` — agent presets, default agent, max concurrency.
- `agent-runs/{runId}.log` — streamed run output + archived result files.
- `agent-results/{cardId}.json` — transient agent→app result handoff (watched, then archived).

## Repo Conventions

- TypeScript: file-scoped modules, `@/` path alias, server/client component split (`"use client"` where needed). shadcn-style UI in `components/ui/`. Format & lint with biome (`bun run check:fix`); `lint-staged` + husky enforce on commit.
- i18n: every user-facing string goes through `next-intl`; add keys to **both** `src/messages/en.json` and `src/messages/fr.json`. Don't hard-code copy.
- Rust↔TS payloads: Rust structs use `#[serde(rename_all = "camelCase")]`; mirror field names exactly in `src/types/`. Adding a field to a model requires updating every struct literal (`add_card`, `demo.rs`, `materialize_card_for_schedule`).
  - **Known mismatch:** TS `AppSettings` has `defaultAgentId` plus `theme`/`locale`/`defaultHomePage`, but Rust `Settings` only reads `defaultAgent` + `agents` + `maxConcurrentAgents`. The extra fields don't round-trip through `save_settings`. Don't "fix" silently — confirm intent first.
- Agent presets: configured in Settings (`binary`, `argsTemplate`, optional `workingDir`). `argsTemplate` **must contain `{prompt}`**. New default presets go in both `settings.rs::default_agent_presets()` and `src/types/settings.ts::DEFAULT_AGENT_PRESETS`.
- Concurrency: route every agent launch through `request_launch` (not `spawn_agent_for_card` directly) so the queue is respected — the one intentional exception is `trigger_schedule_now` (explicit immediate run).
- Streaming: read agent stdout/stderr line-by-line on threads. Never block on full process output — it breaks live logs.
- The browser dev backend (`browser-backend.ts`) only implements a subset; agent/process commands (`launch_agent`, `get_run_log`, …) are desktop-only and throw in the browser.

## TODO / backlog

`TODO.md` is the living feature backlog (kanban-style: `[ ]` todo, `[~]` in progress, `[x]` done). Update item statuses there when you complete backlog work.
