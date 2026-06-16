# Maestro web e2e

UI flows for the Myra Agents web app, driven by [Maestro](https://docs.maestro.dev)
against Chromium.

## Run

```bash
# Pro tier unlocks the Integrations / Sync / Connections panels without sign-in.
cd app && NEXT_PUBLIC_MYRA_TIER=pro bun dev    # serves http://localhost:1420
maestro test app/tests/e2e --exclude-tags integrations,plugins   # web-safe suite
# or one flow / by tag:
maestro test app/tests/e2e/settings-tabs.yaml
maestro test app/tests/e2e --include-tags settings
```

### Deterministic runs — serve the static export

`bun dev` uses Turbopack with hot-module reload. Running the whole suite
back-to-back occasionally trips a dev-only `ChunkLoadError` (a recompile
rewrites a chunk hash while a page still references the old one), which makes
the heavier `/settings`-based flows flake. Run against the **static export**
instead — stable content-hashed chunks, no HMR, ms-fast routes:

```bash
cd app && NEXT_PUBLIC_MYRA_TIER=pro bun run build   # output: "export" → app/out
bunx serve out -l 1420                               # serve the static build
maestro test app/tests/e2e --exclude-tags integrations,plugins
```

This is the environment CI should use; the suite is deterministically green on it.

## Flows

| flow                     | tag            | backend? | covers                                                            |
|--------------------------|----------------|----------|-------------------------------------------------------------------|
| `smoke.yaml`             | —              | web      | app boots, shell renders                                          |
| `settings-tabs.yaml`     | `settings`     | web      | Settings tab rail + the backend-independent panels switch and render: Hub (Connections), Preferences, Agents, Data. Non-mutating. |
| `navigation.yaml`        | `navigation`   | web      | Workspace sidebar routing: Kanban → Schedules → Day Planner → Logs → back, one unique string per route. Non-mutating. |
| `connections.yaml`       | `connections`  | web      | multi-backend board aggregation: permanent local/Primary connection, add + remove a remote. Self-cleaning. |
| `sync.yaml`              | `sync`         | web      | E2E-encrypted sync panel renders + its hub/auth gating copy.      |
| `kanban.yaml`            | `kanban`       | web      | New Task composer: Title / Column / Create. Non-mutating (cancels). |
| `integrations.yaml`      | `integrations` | **server** | plugin **instances** panel + 3-step Connect wizard (Plugin → Configure → Machines): Slack config field, trigger chips, message template, machine fan-out. Non-mutating. |
| `integrations-edit.yaml` | `integrations` | **server** | edit path: opening an instance reuses the wizard pre-filled ("Edit integration"). Needs ≥1 instance. Non-mutating. |
| `plugins.yaml`           | `plugins`      | **server** | Plugins tab: Slack webhook-URL renders as a visible text field (config `type: "string"`, not a masked secret). |

**backend?** — `web` flows pass against a bare `bun dev` / static export (the
in-browser offline backend). The `server` flows need a real backend that
enumerates filesystem plugins; in web mode the Plugins/Integrations panels show
*"No plugins installed"*, so those flows are excluded from the default web run
(`--exclude-tags integrations,plugins`). Run them with the Tauri app
(`bun tauri:dev`) or the Rust sidecar so `~/.myra-agents/plugins` is visible.

## Notes

- The `integrations` / `plugins` flows need the `slack` plugin installed on the
  backend (`~/.myra-agents/plugins/slack`) **and** a backend that reads it.
- The web app gates Pro features; build/run with `NEXT_PUBLIC_MYRA_TIER=pro` so
  the Integrations / Sync / Connections panels are reachable without sign-in.
- These flows assert the *authoring* UI without standing up a hub, a second
  device, or live webhooks. The crypto/merge and webhook-engine logic is covered
  by unit tests (`src/lib/sync/*.test.ts`, server `cargo test`).
- `packages/shared` is a submodule pinned to the `feature/e2e-sync` commit that
  ships the sync wire contract (`SYNC_ROUTES`, `SyncDevice`, …). If `/settings`
  fails to build with *"Export SYNC_ROUTES doesn't exist"*, the submodule has
  drifted — run `git submodule update --checkout packages/shared`.
