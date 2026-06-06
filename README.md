# Myra Agents

A desktop **Kanban board that runs CLI coding agents**. Each card carries a
prompt; launch it and Myra Agents spawns a configured agent (OpenCode / GitHub
Copilot CLI / Claude / your own binary) in headless mode, streams its output
live onto the card, and moves the card through the workflow as the agent reports
progress. Schedules can auto-create and launch cards on a cron / daily / weekly /
interval / once cadence.

> **Stack:** Next.js 16 (App Router, React 19, TypeScript) + Tauri v2 (Rust) ·
> **Package manager:** bun · **Lint/format:** biome
>
> UI originally based on the [studio admin](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) dashboard template.

Myra Agents is **local-first**: the desktop app runs fully on your machine
against a bundled local server sidecar. An optional managed cloud (sign-in,
remote machines) can be enabled via environment variables, but is not required.

---

## Features

- **Kanban lifecycle** — Draft → To Do → In Progress → Waiting Feedback → Awaiting Review → Done (+ Trash), driven by what the agent reports.
- **Per-card agent + working directory**, with configurable agent presets (name, binary, args template with a `{prompt}` placeholder, default working dir).
- **Live streamed logs** per run, plus a logs/history view with duration and (when reported) token/cost stats.
- **Run queue** — `maxConcurrentAgents` limit (0 = unlimited); launches over the limit queue and dequeue as agents finish.
- **Schedules** — once / daily / weekly / interval / cron, with a planner view; runs in the background from the system tray.
- **i18n** — English + French.

---

## Quickstart

This repo uses a git **submodule** for the shared types/contracts package, and
downloads a pre-built **server sidecar** binary at build time.

```bash
# 1. Clone WITH submodules (or run `git submodule update --init` after cloning)
git clone --recurse-submodules https://github.com/Myra-Agents/Myra-Agents.git
cd Myra-Agents

# 2. Install deps
bun install

# 3. Run the desktop app (Tauri). This downloads the server sidecar binary
#    (scripts/build-sidecar.mjs) then launches the Tauri shell + Next dev server.
bun run tauri:dev
```

Other run modes:

```bash
bun run tauri:demo   # isolated demo data + seed (DEMO=1)
bun run tauri:build  # production desktop bundle
bun run dev          # frontend only, in a plain browser (localStorage stand-in backend)
```

### Prerequisites

- [bun](https://bun.sh)
- Rust toolchain + [Tauri v2 OS prerequisites](https://v2.tauri.app/start/prerequisites/)
- `rustc` on PATH (the sidecar download resolves your host target triple from `rustc -Vv`)

### Optional cloud features

Copy `.env.example` → `.env.local` and fill in the `NEXT_PUBLIC_*` values to
enable sign-in (Clerk publishable key) and a managed hub. Everything is optional
— leave them empty to run app-only.

### macOS code signing & notarization

`bun run tauri:build` produces an unsigned bundle by default. To sign it with a
**Developer ID Application** certificate (and notarize it so Gatekeeper opens it
without warnings), use the helper:

```bash
./scripts/macos-sign.sh          # interactive menu
./scripts/macos-sign.sh build    # local signed (optionally notarized) build
./scripts/macos-sign.sh ci       # one-time: export .p12 + push GitHub secrets
./scripts/macos-sign.sh release  # push a v* tag → signed build in CI
```

**One-time prerequisites** (just a Developer ID Application cert — no App Store /
App ID / provisioning profile for direct distribution):

1. **App-specific password** for notarization — log in at
   [appleid.apple.com](https://appleid.apple.com) → **Sign-In & Security →
   App-Specific Passwords → +** → name it (e.g. "myra notarization") → copy the
   16-char code (`xxxx-xxxx-xxxx-xxxx`). This is **not** your Apple ID login
   password; the notary API requires it because the account has 2FA.
2. **Accept agreements** once at
   [App Store Connect](https://appstoreconnect.apple.com) (notarization 401s
   until the latest Program License Agreement is accepted).
3. **Export the cert** as a `.p12` (cert + private key): Keychain Access → login
   → My Certificates → right-click *Developer ID Application: …* → Export → set
   a password.

Then `./scripts/macos-sign.sh ci` pushes six repo secrets
(`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`). To rotate just the notarization
password later: `printf %s 'xxxx-xxxx-xxxx-xxxx' | gh secret set APPLE_PASSWORD`.

CI (`.github/workflows/release.yml`) signs + notarizes automatically when the
secrets are set; without them, builds stay unsigned. Full reference:
[`src-tauri/SIGNING.md`](src-tauri/SIGNING.md).

---

## Architecture

- **`src/`** — Next.js frontend (App Router, React 19). Routes under
  `app/(main)`: `kanban`, `schedules`, `planner`, `logs`, `settings`. One hook
  per concern in `hooks/`; shadcn-style UI in `components/ui/`. All backend calls
  go through `src/lib/tauri.ts` wrappers; the connection layer
  (`src/lib/connections`, `src/lib/transport`) routes commands to the local
  sidecar over HTTP (and optionally remote/cloud connections).
- **`src-tauri/`** — Tauri v2 (Rust) desktop shell. Manages the window/tray and
  supervises the local **server sidecar** (spawns / adopts the `myra-server`
  binary, streams its output). Frameless window; close-to-tray.
- **`packages/shared/`** — git submodule
  ([Myra-Agents-Shared](https://github.com/Myra-Agents/Myra-Agents-Shared)):
  TypeScript types, API contracts, and pure domain helpers shared across the
  ecosystem.
- **Server sidecar** — a pre-built binary downloaded by
  `scripts/build-sidecar.mjs` (pinned in `server-version.json`) and bundled by
  Tauri as `externalBin`. It backs the desktop "local" board over
  `http://127.0.0.1:<port>`. Its source is maintained separately.

---

## Verification gates

```bash
npx tsc --noEmit                 # frontend types
cd src-tauri && cargo check      # Rust backend
npx biome check                  # lint/format (use --write to fix)
```

Husky + lint-staged run biome on commit.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). In short: branch, keep commits
conventional (`feat:` / `fix:` / `chore:`), run the verification gates, and open
a PR.

## License

[MIT](./LICENSE).
