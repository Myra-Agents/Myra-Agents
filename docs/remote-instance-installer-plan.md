# Remote instance installer — cross-platform plan

How to make adding a remote machine (an "instance" that runs agents and dials
the hub) a one-liner instead of "clone the repo + `bun install` + paste a
command". The dashboard desktop app already ships an installer; this closes the
last production gap — see [`centralized-hub-plan.md`](centralized-hub-plan.md)
and the deploy runbook [`hub-deploy.md`](hub-deploy.md).

## Where we are

- `bun build --compile packages/server/src/index.ts` already emits a
  **self-contained** `myra-server` binary (no Bun/Node on the target). The
  desktop app bundles exactly this as its sidecar (`scripts/build-sidecar.mjs`).
- The binary already does both roles: **start** the server (default) and
  **enroll** (`enroll <code>` via argv, in `connector/cli.ts`).
- State lives in `~/.myra-agents/` — `hub-credential.json` holds the enrollment;
  on boot the server auto-dials the hub if that file exists (`index.ts`).

So the runtime is done. What's missing is **distribution + lifecycle**: ship the
binary per-OS, enroll it, and keep it running.

## Target UX

```bash
# macOS / Linux
curl -sSf https://<host>/install-remote.sh | MYRA_HUB_URL=<hub> CODE=<code> sh

# Windows (PowerShell)
$env:MYRA_HUB_URL="<hub>"; $env:CODE="<code>"; iwr https://<host>/install-remote.ps1 | iex
```

One line, copy-pasted from the dashboard's "Pair instance" panel. Downloads the
right binary, enrolls, installs a per-user service that survives logout/reboot.

## Deliverables (phased)

### A — Unified binary entry + lifecycle commands
`packages/server/src/main.ts` (replaces the split `index.ts`/`connector/cli.ts`
entry; both keep working as thin wrappers or are folded in). Routes on argv:

| Command | Action |
|---|---|
| `myra-server` (no arg) | start the server (current `index.ts` default) |
| `myra-server enroll <code>` | pair to a hub (current `cli.ts`) |
| `myra-server status` | print credential (hub, user, instanceId) + whether running |
| `myra-server unenroll` | delete `hub-credential.json` |
| `myra-server install-service` | write + enable the OS service (see B) |
| `myra-server uninstall-service` | stop + remove the OS service |

Env honored: `MYRA_HUB_URL`, `MYRA_INSTANCE_ID`/`LABEL` (default hostname),
`PORT`, `MYRA_DATA_DIR`. Keeps `bun run enroll` working in-repo.

### B — Per-user service installers (no root/admin)
`packages/server/src/service/` — one module per platform, selected at runtime.
All run as the **current user**, write the resolved binary path + env, and point
the service at `myra-server` (start mode).

| OS | Mechanism | Artifact |
|---|---|---|
| Linux | systemd **user** unit | `~/.config/systemd/user/myra-server.service` → `systemctl --user enable --now myra-server` (+ `loginctl enable-linger` so it runs without an active session) |
| macOS | launchd **LaunchAgent** | `~/Library/LaunchAgents/dev.myra-agents.server.plist` → `launchctl load -w` |
| Windows | Task Scheduler (`ONLOGON`) | `schtasks /create /sc ONLOGON` — no admin; runs at user logon |

Fallback when no service manager: print the manual `myra-server &` instruction.

### C — Install scripts
- `scripts/install-remote.sh` (POSIX sh; macOS + Linux):
  1. Detect OS + arch (`uname -sm`) → map to release asset name.
  2. Download binary from GitHub Releases → `~/.local/bin/myra-server` (Linux) or
     `/usr/local/bin` (macOS, fallback `~/.local/bin`); `chmod +x`.
  3. macOS: `xattr -d com.apple.quarantine` so Gatekeeper doesn't block it.
  4. If `CODE` set → `myra-server enroll "$CODE"`.
  5. If enrolled → `myra-server install-service`.
- `scripts/install-remote.ps1` (Windows): same flow; binary to
  `$HOME\.myra-agents\bin\`, add to user `PATH`, then enroll + install-service.

Scripts are self-contained, verify a checksum, and are idempotent (re-run to
update the binary).

### D — CI: build + publish release binaries
`.github/workflows/release-server.yml`, triggered on `v*` tags:

| Runner | Output asset |
|---|---|
| `ubuntu-latest` | `myra-server-x86_64-unknown-linux-gnu` |
| `ubuntu-24.04-arm` | `myra-server-aarch64-unknown-linux-gnu` |
| `macos-13` (x64) | `myra-server-x86_64-apple-darwin` |
| `macos-14` (arm64) | `myra-server-aarch64-apple-darwin` |
| `windows-latest` | `myra-server-x86_64-pc-windows-msvc.exe` |

Each job: install Bun → `bun install` → `bun build --compile … --outfile <asset>`
→ emit a `.sha256` → upload as a release asset. Install scripts pull from
`releases/latest/download/`.

### E — Dashboard pairing UX
`src/components/settings/connections-panel.tsx`: replace the raw
`bun run enroll <code>` hint with the generated one-liner (curl/iwr form,
OS-toggle), built from the hub URL + the minted code. Copyable.

## Order

A + B first (pure code, unit-testable on each OS locally), then C + D
(distribution), then E (UX). Each is independently shippable; the desktop
sidecar build (`build-sidecar.mjs`) is unaffected — it keeps compiling the same
entry.

## Risks / notes

- **macOS Gatekeeper / notarization** — an unsigned downloaded binary is
  quarantined. Short term: `xattr -d` in the script. Real fix: sign + notarize
  the standalone binary (own Apple Developer cert) — defer, document.
- **Windows SmartScreen** — unsigned `.exe` warns on first run; code-signing
  cert needed for a clean experience. Defer, document.
- **Binary size** — `bun build --compile` bundles the runtime (~50–100 MB/asset).
  Acceptable for a server; note it.
- **Auto-update** — out of scope here; the binary can later self-update by
  re-running the install script. Tracked separately.
- **Token TTL** — instance credential is 90 days; a long-lived service must
  handle re-enrollment when it expires (connector already stops on `1008`). A
  refresh/renew flow is a follow-up.
