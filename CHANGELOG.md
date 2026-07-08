# Changelog

All notable changes to Myra Agents are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

## [0.7.0] — 2026-07-09

### Added

- **Continuous session thread** — replying to a finished run now continues the conversation in place: a card's runs render as one continuous thread instead of opening a separate screen per reply.

### Changed

- **OpenCode transcripts from its JSON event stream** — OpenCode runs are now parsed from its `--format json` output (paired with the sidecar). Messages are no longer duplicated, markdown and tool input/output render structurally, and token/cost plus the session id come through the stream.

### Fixed

- **Windows console flashes** — the sidecar no longer pops foreground console windows when it launches agent CLIs, git, or service tooling (paired with the sidecar's `CREATE_NO_WINDOW` fix).
- **Reply continues the exact session** — a reply resumes the run's own OpenCode session (`-s <id>`) instead of the blind "continue the last session", and queued follow-ups keep the continuation.

## [0.6.0] — 2026-07-08

### Added

- **Run-started toasts** — launching or replying to a run now shows a toast with a link to the started operation; scheduler-materialized runs are toasted too.
- **Suggest patrol change from run feedback** — a run's feedback can propose an edit to its patrol/schedule.
- **Auto-test installed agents** — never-tested installed agents are exercised automatically so their availability is known before first use.
- **Launch at login** — a Settings toggle to start Myra Agents automatically when you log in.
- **Template breadcrumb** — the header breadcrumb now carries a Template segment.

### Fixed

- **PostHog in dev/test** — analytics capture is disabled in dev and test builds (no noise in the project from local runs).
- **Reply relaunches the agent** — replying to a run now relaunches the agent (pairs with the sidecar's optional resume-on-launch).
- **Windows tray popover** — renders correctly on Windows.
- **Schedules branch listing** — no longer freezes the UI while listing branches.
- **Windows app icon** — enlarged the glyph in `icon.ico`.

### Changed

- Removed the auto-resume toggles from agent settings.
- Bundles the **myra-server v0.10.0** sidecar (per-patrol default run home dir, optional resume on `launch_agent`).

## [0.3.1] — 2026-07-02

### Fixed

- **macOS release appearance** — release binaries were built against the macOS 14.5 SDK, so macOS 26 rendered them with the legacy compatibility appearance (smaller traffic lights, old materials) unlike local dev builds. Release CI now builds on the macOS 26 image and asserts the linked SDK is 26+.

## [0.3.0] — 2026-07-02

### Added

- **Working animation preference** — pick the animated Myra mark shown while an agent runs (Shimmer / Assemble) under Settings → Preferences; persisted to `localStorage` and applied to the live thinking indicator.
- **Runs page** — task overview with status filtering and list/kanban toggle.
- **Self-hosted hub** — registration UI in Settings to connect a custom hub server.
- **Navigation history** — back/forward controls in the header (in progress).
- **Schedule edit page** — dedicated edit route for individual schedules (in progress).

### Fixed

- Prevent native drag ghost on images and links inside the sidebar in the Tauri desktop app (`-webkit-user-drag: none` on `body`, `img`, and `a`).
- **Windows title bar** — minimize/maximize/close buttons now span the full header height on hover (Windows 11-style flush coverage).
- **Windows/Linux window** — removed rounded corners; window now has sharp edges on Windows and Linux.
- **Board/schedules live subscriptions** — concurrent topology changes (e.g. hub reconnect + local restart) could leave duplicate `agent-result-changed` / `agent-log-appended` / `schedules-updated` listeners, causing events to fire twice; subscriptions are now serialised via a promise chain.
- **Connection manager** — when `NEXT_PUBLIC_MYRA_SERVER_URL` is set, the previously chosen remote primary connection was silently reset to `local`; the persisted primary is now preserved.
- **History time-range filter** — opening the History page with a non-default range (e.g. "7d") briefly showed all runs before the correct filter applied; `useNow()` now initialises to `Date.now()` instead of `0`.
- **Logs — Stop button** — clicking Stop now immediately shows a disabled "Stopping…" state while the cancellation is in flight, instead of keeping the active "Stop" label until the backend confirms.
- **Dead shortcut flag** — `pendingNewSchedule` in the shortcut store was set by the tray but never consumed by any component (the URL param `?new=1` already handles the intent); removed the dead state and its callers.

### Changed

- Column-visibility hooks (`useRunsColumns`, `useHistoryColumns`) extracted into a shared `makeColumnVisibilityHook` factory — eliminates duplicated persist/toggle/reset logic.
- **Runs trend chart** — cancelled runs now show as their own (grey) segment instead of being dropped, so the bars reflect every terminal outcome.
- **Settings command preview** — the previewed agent command now reflects preset flags and `ollama launch` wrapping (via the extended `buildAgentCommand`).

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
