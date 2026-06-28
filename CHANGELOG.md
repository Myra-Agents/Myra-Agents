# Changelog

All notable changes to Myra Agents are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Runs page** — task overview with status filtering and list/kanban toggle.
- **Self-hosted hub** — registration UI in Settings to connect a custom hub server.
- **Navigation history** — back/forward controls in the header (in progress).
- **Schedule edit page** — dedicated edit route for individual schedules (in progress).

### Fixed

- Prevent native drag ghost on images and links inside the sidebar in the Tauri desktop app (`-webkit-user-drag: none` on `body`, `img`, and `a`).

---

## [0.2.2] — 2026-06-16

### Added

- **Cursor-inspired theme** — new Myra preset with Cursor-style color palette and typography.

### Fixed

- Logs page: wrap `useSearchParams` in a Suspense boundary to fix static-export build crash.
- CI: macOS code signing now uses a dedicated unlocked keychain; x86_64 row skips signing correctly.

---

## [0.2.1] — 2026-06-16

Hotfix release immediately after v0.2.0.

### Fixed

- Logs page: `useSearchParams` outside Suspense caused a build-time error in the static export.

---

## [0.2.0] — 2026-06-16

Major feature release.

### Added

- **Agent conversation view** — Logs page renders agent output as a chat-style conversation with syntax-highlighted file diffs, reply support, and a persistent reopen bar.
- **Keep-awake & auto-resume** — toggles in agent settings to prevent sleep and automatically restart interrupted runs.
- **Logs filtering & statistics** — search, filter by status, and summary stats on the Logs page.
- **Task locking** — non-draft kanban cards are locked while an agent is running.
- **Schedules table** — schedule list rendered as a Cursor-style table with inline status.
- **PostHog analytics** — session replay, feature flags, environment tags, error tracking, and console-log capture.
- **AI task assist** — generate a task prompt from a short description directly in the New Task modal.
- **Local models (Ollama)** — model picker shows locally installed Ollama models; Settings panel lets you pull, stop, and manage them.
- **Rich tray popover** — system-tray click opens a popover with live agent status and board stats.
- **Per-model effort** — effort dropdown per agent preset, gated by model capability; model cost shown in picker.
- **Live flag catalog** — agent options popover fetches the flag list from the binary at runtime.
- **Sidebar hover-peek** — collapsed offcanvas sidebar slides back as an overlay on hover (Linear-style).
- **Platform window controls** — custom Windows 11-style and Linux GNOME-style titlebars on decoration-less builds; macOS keeps native traffic lights.
- **macOS DMG background** — Linear-style installer background image.
- **OpenCode integration** — binary detection, working-directory picker, and flag options for OpenCode agents.
- **Overview landing page** — stats and recent runs summary on the home screen.
- **Remote server management** — connect to, inspect, and refresh a self-hosted Myra server from Settings.
- **Docker web image** — static export containerised for self-hosting (published to GHCR on release).
- **Native AX test harness** — `tests/native/` skeleton for macOS accessibility tree-driven UI tests.
- **PostHog harness & model tags** — agent launch and create events tagged with harness name and model.
- Hover tooltips on agent flag options (500 ms delay).
- Richer sidebar nav tooltips showing item description (2 s delay).

### Fixed

- Light-mode column and surface visibility on the kanban board.
- Agent binary install check shows a loading row while the probe resolves.
- Runtime connection status no longer persisted to disk across restarts.
- Tray listener guarded against running outside Tauri.
- Tray popover height fits content; no hydration warning.
- Model picker persists selection; uniform row heights.
- Schedule card height reduced; modal scroll and alignment tightened.
- Overview empty-state sections visible when no data.
- Support-card links open in the OS browser (not the in-app webview).
- Hide vertical scrollbar in main content area.

---

## [0.1.0] — 2026-06-06

Initial public release.

### Added

- **Kanban board** — agent task cards flowing Draft → Todo → In Progress → Waiting Feedback → Awaiting Review → Done, with a Trash lane.
- **Schedules** — cron, daily, weekly, interval, and one-shot triggers that materialise cards automatically.
- **Settings** — agent preset configuration (binary, args template, working directory) and plugin management.
- **Mandatory Myra theme** — Lato typography, brand colours, branded active-item indicator in the sidebar nav.
- **macOS app icon** — custom Icon Composer asset.
- **Sidebar support card** — links to issue tracker and GitHub star.
- **Tauri v2 desktop shell** — frameless, transparent window; native macOS traffic lights; system-tray icon.
- **Bundled server sidecar** — pre-built `myra-server` binary supervised by the Tauri shell.
- **Plugin settings tab** — enable/disable runtime plugins; group by type in collapsible sections.
- **macOS code signing & notarization** — Developer ID signing with `macos-sign.sh` orchestrator.
