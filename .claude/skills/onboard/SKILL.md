---
name: onboard
description: Onboard a new developer to the Myra Agents codebase. Use when someone says "onboard me", "/onboard", "I'm new to this repo", "help me get set up", "walk me through the project", or asks how to start developing / build / run Myra Agents for the first time. Guides through prerequisites, install, running the app, an architecture tour, conventions, and a first contribution.
---

# Onboarding a new Myra Agents developer

Goal: get a new dev from a fresh clone to a running app and a first merged change, while teaching the non-obvious parts of the codebase. Walk through the steps **interactively** — run a step, confirm it worked (check the output), then move on. Don't dump everything at once. Adapt to what the dev already has.

Myra Agents = a **Kanban board that runs CLI coding agents**, built as **Next.js 16 (React 19, TS) + Tauri v2 (Rust)**. Package manager **bun**, lint/format **biome**.

## Step 0 — Orient

Ask the dev what they want to do first (or infer from their request):
- Just run it and look around → Steps 1–3.
- Make a code change → all steps.
- Understand a specific subsystem → jump to the relevant part of the Architecture tour.

Point them at the canonical docs: `CLAUDE.md` (agent/dev instructions + conventions) and `README.md` (project overview). This skill is the guided path; those files are the reference.

## Step 1 — Prerequisites

Check each; help install what's missing.

- **bun** ≥ 1.3 — `bun --version` (install: https://bun.sh).
- **Rust toolchain** — `rustc --version` && `cargo --version` (install: https://rustup.rs). Tauri needs the stable toolchain.
- **Tauri OS deps** — macOS: Xcode CLT (`xcode-select --install`). Linux: webkit2gtk + build essentials (see https://tauri.app/start/prerequisites/). Windows: WebView2 + MSVC build tools.
- **Node** (only needed for `npx tsc`/some tooling) — `node --version`.

## Step 2 — Install

```bash
bun install
```

This installs frontend deps. Rust deps are fetched on first `cargo`/`tauri` build.

## Step 3 — Run

Two modes — explain the difference:

```bash
bun run tauri:dev    # full desktop app: Tauri (Rust) + Next dev server on :1420
bun run tauri:demo   # same, DEMO=1 → isolated ~/.myra-agents-demo data, pre-seeded board
bun run dev          # frontend ONLY in a browser (no Rust); uses the localStorage dev backend
```

Recommend `bun run tauri:demo` for a first look — it seeds a board with a card in every column and one schedule of each kind, so the UI isn't empty. First Rust build is slow (compiling Tauri); that's normal.

If they only want to poke the UI quickly, `bun run dev` opens http://localhost:1420 with `src/lib/browser-backend.ts` standing in for the Rust commands (agent/process features are disabled there).

## Step 4 — Architecture tour

Give a short guided tour. Have them open these while you explain (full detail lives in `CLAUDE.md` → Architecture):

- **Data flow**: cards live in `~/.myra-agents/board.json`. A card carries a prompt; launching it spawns a CLI agent that streams output back and writes a result file that the watcher turns into a status change.
- **Backend** (`src-tauri/src/`): `lib.rs` registers every `#[tauri::command]` (one `generate_handler!`). `commands/agent.rs` (spawn + run queue + streaming), `commands/kanban.rs` (card CRUD + storage), `commands/schedule.rs`, `watcher.rs` (result-file → card transition), `scheduler.rs` (tick loop), `settings.rs`.
- **Frontend** (`src/`): routes in `app/(main)/` (kanban, schedules, planner, logs, settings); one hook per concern in `hooks/`; `components/kanban/` for the board; `components/ui/` shadcn primitives.
- **The bridge**: all calls go through `src/lib/tauri.ts` `invoke()`/`listen()`. Live updates are push events (`agent-log-appended`, `agent-result-changed`, `schedules-updated`), not polling.
- **Agent run lifecycle**: read the "Agent Run Lifecycle" section in `CLAUDE.md` — the result protocol (`agent-results/{cardId}.json` with `status` awaiting_review/waiting_feedback/failed, optional `tokens`/`cost`) is the key contract.

## Step 5 — Conventions that bite

Surface these early — they cause the most rework:

- **i18n**: every user-facing string goes through `next-intl`. Add keys to **both** `src/messages/en.json` and `src/messages/fr.json`.
- **Rust↔TS payloads**: Rust uses `#[serde(rename_all = "camelCase")]`; mirror field names exactly in `src/types/`. Adding a field to a model means updating **every** struct literal (`add_card`, `demo.rs`, `materialize_card_for_schedule`).
- **Browser dev backend**: when you change a Tauri command's shape, update `src/lib/browser-backend.ts` too, or `bun run dev` breaks.
- **Concurrency**: launch agents through `request_launch` (not `spawn_agent_for_card`) so the run queue is respected.
- **Known settings mismatch**: TS `AppSettings` has fields (`defaultAgentId`, `theme`, `locale`, `defaultHomePage`) the Rust `Settings` struct doesn't read — don't "fix" silently.
- House style: file-scoped TS modules, `@/` alias, `"use client"` where needed, shadcn UI.

## Step 6 — Verify (the gates)

Before any change is "done", all three must pass:

```bash
npx tsc --noEmit                 # frontend types
cd src-tauri && cargo check      # Rust backend
npx biome check                  # lint/format (use: npx biome check --write to autofix)
```

There is **no unit-test suite** — verification is these gates + a manual run. husky + lint-staged run biome on commit.

## Step 7 — First contribution

Walk them through the loop:

1. Branch off `develop` (default integration branch; `main` is release). `git checkout -b feat/<thing>`.
2. Make the change. Check `TODO.md` for the backlog (`[ ]`/`[~]`/`[x]`) if they want a starter task.
3. Run the Step 6 gates + a manual `bun run tauri:dev` smoke test.
4. Commit (conventional style), push, open a PR against `develop`.

Suggest a good first task: add a built-in/demo card, a small UI tweak in `components/kanban/`, or a new i18n string — each touches one layer and exercises the gates.

## Wrap up

Confirm the dev has: app running, knows where backend vs frontend live, knows the three verification gates, and knows the branch/PR flow. Point them back to `CLAUDE.md` as the living source of truth.
