# Maestro web e2e

UI flows for the Myra Agents web app, driven by [Maestro](https://docs.maestro.dev)
against Chromium.

## Run

```bash
cd app && bun dev            # serves http://localhost:1420
maestro test app/tests/e2e   # whole suite
# or one flow / by tag:
maestro test app/tests/e2e/integrations.yaml
maestro test app/tests/e2e --include-tags integrations
```

## Flows

| flow                     | tag            | covers                                                            |
|--------------------------|----------------|-------------------------------------------------------------------|
| `smoke.yaml`             | —              | app boots, shell renders                                          |
| `integrations.yaml`      | `integrations` | plugin **instances** panel + 3-step Connect wizard (Plugin → Configure → Machines): Slack config field, trigger chips, message template, machine fan-out. Non-mutating. |
| `integrations-edit.yaml` | `integrations` | edit path: opening an instance reuses the wizard pre-filled ("Edit integration"). Needs ≥1 instance. Non-mutating. |
| `connections.yaml`       | `connections`  | multi-backend board aggregation: permanent local/Primary connection, add + remove a remote. Self-cleaning. |
| `sync.yaml`              | `sync`         | E2E-encrypted sync panel renders + its hub/auth gating copy.      |
| `plugins.yaml`           | `plugins`      | Plugins tab: Slack webhook-URL renders as a visible text field (config `type: "string"`, not a masked secret). |
| `kanban.yaml`            | `kanban`       | New Card composer: Title / Column / Create. Non-mutating (cancels). |

## Notes

- `integrations.yaml` needs the `slack` plugin installed on the backend
  (`~/.myra-agents/plugins/slack`).
- The web app gates Pro features; run the dev server with
  `NEXT_PUBLIC_MYRA_TIER=pro` so the Integrations / Sync / Connections panels
  are reachable without sign-in.
- These flows assert the *authoring* UI without standing up a hub, a second
  device, or live webhooks. The crypto/merge and webhook-engine logic is covered
  by unit tests (`src/lib/sync/*.test.ts`, server `cargo test`).
