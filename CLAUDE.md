# Myra Agents — Claude Code Instructions

Myra Agents is a desktop app: a **Kanban board that runs CLI coding agents**.
Each card carries a prompt; launching it runs a configured agent binary
(opencode / copilot / claude / custom) in headless mode and streams its output
back to the board. Cards flow Draft → Todo → In Progress → Waiting Feedback →
Awaiting Review → Done, with a Trash lane. Schedules can auto-materialize cards
and launch them on a cron/daily/weekly/interval/once basis.

Stack: **Next.js 16 (App Router, React 19, TypeScript) frontend + Tauri v2
(Rust) desktop shell**. Package manager is **bun**; lint/format is **biome**.
There is no unit-test project — verification is type-check + cargo check + a
manual run.

This is the **open-source app** repo. Two pieces live elsewhere:
- **`packages/shared`** is a git submodule
  ([Myra-Agents-Shared](https://github.com/Myra-Agents/Myra-Agents-Shared)) —
  shared types, contracts, and domain helpers. Run `git submodule update --init`
  after cloning. Edit shared code in that repo, then bump the submodule pointer here.
- **The server sidecar** (`myra-server`) is a **pre-built binary**, not source.
  `scripts/build-sidecar.mjs` downloads it (pinned in `server-version.json`) into
  `src-tauri/binaries/`; Tauri bundles it as `externalBin` and the Rust shell
  supervises it. The desktop "local" board is served by this binary over HTTP.

## Build And Run

```bash
git submodule update --init   # first time, if not cloned with --recurse-submodules
bun install
bun run tauri:dev      # downloads sidecar, runs Tauri shell + Next dev server (port 1420)
bun run tauri:demo     # same, with DEMO=1 (isolated demo data + seed)
bun run tauri:build    # production bundle
```

Frontend-only (no Tauri, browser localStorage stand-in backend kicks in):

```bash
bun run dev            # next dev -p 1420
```

Verification gates (run before declaring done):

```bash
npx tsc --noEmit                 # frontend types
cd src-tauri && cargo check      # Rust backend
npx biome check                  # lint/format (use --write to fix)
```

`next.config` does a static export to `out/`, which Tauri loads as
`frontendDist`. App identifier `com.myra-agents.app`, product name "Myra Agents".
The window is frameless (`decorations: false`, `transparent: true`) — window
controls live in `src/app/(main)/_components/window-controls.tsx`. Closing the
window hides to the tray instead of quitting (see `on_window_event` in `lib.rs`).

macOS uses native Overlay traffic lights (AppKit, configured in `tauri.conf.json`).
Windows/Linux render a custom titlebar: Windows 11-style (full-height flat buttons,
red hover on close) or Linux GNOME-style (colored circles). Platform is detected
via `navigator.userAgent`.

**Dev preview** — force a platform style in `bun run dev` (browser, no Tauri):

```js
// In the browser console at localhost:1420:
localStorage.setItem("myra:dev:platform", "windows"); location.reload(); // Windows 11
localStorage.setItem("myra:dev:platform", "linux");   location.reload(); // Linux GNOME
localStorage.removeItem("myra:dev:platform");          location.reload(); // reset
```

Override is ignored in production builds.

## Architecture

### Desktop shell (`src-tauri/src/`)

Entry: `main.rs` → `lib.rs::run()`. `lib.rs` builds the Tauri app, inits the
tray and the filesystem watcher, **spawns/adopts and supervises the `myra-server`
sidecar** (streaming its stdout/stderr), and registers every `#[tauri::command]`
in one `generate_handler!` block. **Any new command must be added there.** The
Rust side is now thin: window/tray, OS helpers, and sidecar lifecycle. The board
data + agent execution are served by the sidecar.

### Frontend (`src/`)

- `app/(main)/` routes: `kanban`, `schedules`, `planner`, `logs`, `settings`
  (plus `_components/` for sidebar + window controls).
- `hooks/` — one hook per concern: `use-kanban`, `use-schedules`,
  `use-settings`, `use-card-templates`, `use-column-preferences`,
  `use-agent-events`, `use-agent-logs`, `use-planner`, `use-theme`.
- `components/kanban/` — board, column, card, card-modal, feedback-modal,
  trash-zone. `components/ui/` — shadcn-style primitives.
- Drag-and-drop via `@dnd-kit`. State is local React + hooks (plus a zustand
  preferences store). Toasts via `sonner`.

### Frontend ↔ backend bridge

- All backend calls go through `src/lib/tauri.ts` `invoke()`/`listen()` wrappers.
  The connection layer (`src/lib/connections`, `src/lib/transport`) routes
  commands across one or more backends — the local sidecar over HTTP
  (`http://127.0.0.1:<port>`), and optionally remote/cloud connections.
- In a plain browser (no Tauri) `invoke` throws `[Dev Mode]…`;
  `src/lib/browser-backend.ts` provides a localStorage-backed stand-in for the
  kanban/schedule/settings commands so the UI is usable in `bun run dev`.
- Live updates are push-based events (e.g. `agent-log-appended`,
  `agent-result-changed`, `schedules-updated`), not polling.

## Repo Conventions

- TypeScript: file-scoped modules, `@/` path alias, server/client component split
  (`"use client"` where needed). shadcn-style UI in `components/ui/`. Format & lint
  with biome (`bun run check:fix`); `lint-staged` + husky enforce on commit.
- i18n: every user-facing string goes through `next-intl`; add keys to **both**
  `src/messages/en.json` and `src/messages/fr.json`. Don't hard-code copy.
- Shared types: canonical definitions live in `@myra/shared`
  (`packages/shared`, a submodule). `src/types/*` re-export from it. Rust structs
  use `#[serde(rename_all = "camelCase")]`; mirror field names exactly in `src/types/`.
- Agent presets: configured in Settings (`binary`, `argsTemplate`, optional
  `workingDir`). `argsTemplate` **must contain `{prompt}`**.

## Server sidecar

The `myra-server` binary is consumed pre-built. `scripts/build-sidecar.mjs`:
resolves the host triple from `rustc -Vv`, reads `server-version.json`, downloads
`myra-server-<triple>[.exe]` (+ verifies its `.sha256`) into `src-tauri/binaries/`,
and caches it. Bump `server-version.json` to adopt a new sidecar release. Set
`MYRA_SERVER_VERSION` / `MYRA_SERVER_REPO` / `MYRA_SERVER_BASE_URL` to override.

## Branching

GitFlow-lite, **org-wide** across all Myra-Agents repos:

- `main` — stable, released code; **tagged releases only**, never commit straight to it.
- `develop` — **default branch**; all day-to-day work integrates here.
- `feature/<slug>` · `fix/<slug>` · `chore/<slug>` — short-lived, branch off `develop`, PR back into `develop`.
- Release: merge `develop` → `main` + tag (`vX.Y.Z`; server uses `server-vX.Y.Z`).
- Hotfix: branch off `main`, PR into `main`, then merge `main` back to `develop`.

Open PRs against `develop`. Conventional Commit subjects. One logical change per PR.
