# Deploying the Myra Hub to Cloudflare (Wrangler runbook)

How to install Wrangler and deploy / operate the centralized hub
(`packages/hub`, phase P4 — the `UserHub` Durable Object + Worker). See
[`centralized-hub-plan.md`](centralized-hub-plan.md) for the architecture.

Everything below runs from `packages/hub` unless noted.

---

## 0. Prerequisites

**Node ≥ 22.** Wrangler refuses older versions (you'll see
`Wrangler requires at least Node.js v22.0.0`). The repo otherwise runs on Bun,
so your shell may default to an older Node — switch with nvm:

```bash
nvm install 22   # once
nvm use 22        # per shell
node -v           # → v22.x
```

A Cloudflare account (free tier is enough for this).

## 1. Install Wrangler

Pick one:

```bash
# On demand, no install (recommended):
bunx wrangler <cmd>          # or: npx wrangler <cmd>

# Pin it to the hub package:
bun add -d wrangler --cwd packages/hub

# Global:
npm i -g wrangler
```

> If `bunx wrangler` reports the Node 21 error, you're on the wrong Node — run
> `nvm use 22` in that shell first (Bun's launcher still uses the PATH Node).

## 2. Log in

```bash
wrangler login
```

Opens a browser to authorize your Cloudflare account. Credentials are stored on
disk (`~/Library/Preferences/.wrangler` on macOS) — you stay logged in across
sessions. This is interactive; run it in your own terminal.

## 3. One-time resources

### KV namespace (pairing codes)

The Worker maps one-time pairing codes → userId in a KV namespace bound as
`PAIRING`. Create it and paste the id into `wrangler.toml`:

```bash
wrangler kv namespace create PAIRING
# → copy the printed id into the [[kv_namespaces]] block of wrangler.toml
```

```toml
[[kv_namespaces]]
binding = "PAIRING"
id = "<the id it printed>"
```

The KV id is **not a secret** — commit it.

### The signing secret

`MYRA_HUB_SECRET` signs every session + instance token (HS256). Set it as a
Worker secret (never a file, never git):

```bash
openssl rand -hex 32 | wrangler secret put MYRA_HUB_SECRET
```

Notes:
- It lives only in Cloudflare. Wrangler can't show it back (write-only); you
  don't need a local copy.
- **Rotating it invalidates everything** signed with the old value — sessions
  die and every enrolled instance must re-enroll. Only re-set it deliberately.

## 4. Deploy

```bash
wrangler deploy
```

Prints your Worker URL, e.g.
`https://myra-hub.<your-subdomain>.workers.dev`. The output also lists the
bindings — confirm you see `USER_HUB` (Durable Object), `PAIRING` (KV), and
`MYRA_HUB_SECRET`.

The DO migration in `wrangler.toml` (`new_sqlite_classes = ["UserHub"]`) is
applied automatically on first deploy.

## 5. Auth: dev login vs production

The hub authenticates dashboards with a session token. Where that token comes
from is pluggable:

- **Dev login** (`POST /auth/login` with `{ "userId": "..." }`) is a stub gated
  by the `MYRA_HUB_DEV_LOGIN` var. It trusts whatever userId you send — fine for
  local testing, **unsafe in production** (anyone can impersonate anyone).

  ```bash
  wrangler deploy --var MYRA_HUB_DEV_LOGIN:1   # enable (testing only)
  wrangler deploy                              # redeploy WITHOUT it → disabled
  ```

- **Production:** leave dev login off and wire OIDC / Cloudflare Access where
  the dev login sits in `src/cf/worker.ts` (`/auth/login`). Deferred — see the
  plan's risks section.

## 6. Smoke test the deployed hub

With dev login enabled:

```bash
HUB=https://myra-hub.<your-subdomain>.workers.dev

# 1) session token
TOKEN=$(curl -s -XPOST -H 'content-type: application/json' \
  -d '{"userId":"me"}' $HUB/auth/login \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')

# 2) one-time pairing code
CODE=$(curl -s -XPOST -H "authorization: Bearer $TOKEN" $HUB/api/instances/pair \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["code"])')

# 3) enroll this machine (DEMO data dir to keep it isolated)
DEMO=1 MYRA_HUB_URL=$HUB MYRA_INSTANCE_ID=cloud-test MYRA_INSTANCE_LABEL="Cloud Test" \
  bun packages/server/src/connector/cli.ts enroll "$CODE"     # run from repo root

# 4) start the instance — it dials wss:// out to the hub
DEMO=1 bun packages/server/src/index.ts

# 5) confirm it’s online + drive it through the hub
curl -s -H "authorization: Bearer $TOKEN" $HUB/api/instances
curl -s -XPOST -H "authorization: Bearer $TOKEN" $HUB/api/i/cloud-test/rpc/get_cards
```

You should see `cloud-test` online and the second call return the instance's
cards — proof the Worker routed through the Durable Object to your machine and
back.

## 6b. Hardening (P6)

Once the hub is exposed, the security posture matters more than the happy path.

### Turn off dev login

Dev login (`MYRA_HUB_DEV_LOGIN`) trusts any `userId` — **anyone can mint a
session for anyone**. It must be off in production:

```bash
wrangler deploy        # redeploy WITHOUT --var MYRA_HUB_DEV_LOGIN:1
```

Until OIDC / Cloudflare Access is wired in (deferred), the hub has no real
identity provider — keep it unexposed or behind Access while dev login is off.

### Capability scoping

Each instance enrolls with `capabilities` (`agent`, `os`). The instance rejects
any RPC outside its grant before it reaches the runner — an `agent`-only
instance can't be told to `open_path`. Pure data commands need no capability.
Enroll a restricted instance by narrowing the capabilities the connector sends
in its `hello` (see `packages/server/src/connector`).

### Lock down a self-hosted direct server

The direct Node server (`@myra/server`, no hub) is open by default — fine for
the desktop sidecar on `127.0.0.1`, not for a LAN/public bind. Lock it:

```bash
MYRA_SERVER_TOKEN=$(openssl rand -hex 32) \
MYRA_CORS_ORIGIN=https://board.example.com \
  bun packages/server/src/index.ts
```

- `MYRA_SERVER_TOKEN` — every `/rpc` + `/events` request must carry it (Bearer
  header, or `?token=` for the browser WebSocket). The dashboard sends it from
  the connection's `auth.token`.
- `MYRA_CORS_ORIGIN` — comma-separated allowlist (default
  `http://localhost:1420,http://127.0.0.1:1420`). Replaces the old `*`.

### Adaptive log cadence

Live log lines stream only for a card whose modal is open on a dashboard
(`set_log_watch`). Headless/scheduled runs emit no live frames — the full log
is still written and fetched on demand via `get_run_log`. This keeps an idle
`UserHub` DO hibernating (near-zero cost). No configuration; it's automatic.

### Corporate networks (connector)

The instance connector dials **outbound** `wss://` only, so it traverses NAT and
strict egress firewalls. It uses the runtime's standard TLS — no cert pinning:

| Need | Env |
|---|---|
| Forced egress proxy | `HTTPS_PROXY=http://proxy:3128` |
| Custom corporate CA | `NODE_EXTRA_CA_CERTS=/path/corp-ca.pem` |

A 25s ping heartbeat keeps middleboxes from idle-killing the tunnel. The
connector logs the proxy/CA in effect at startup.

### Revocation + audit

`POST /api/instances/:id/revoke` blacklists a credential and drops its live
tunnel (the connector sees close code `1008` and stops — it must re-enroll). The
hub logs `[audit] connect|disconnect|revoke` lines (visible via `wrangler tail`).

## 7. Operations

| Task | Command |
|---|---|
| Tail live logs | `wrangler tail` |
| List deployments | `wrangler deployments list` |
| Roll back | `wrangler rollback [<version-id>]` |
| Inspect KV | `wrangler kv key list --binding PAIRING` |
| Rotate signing secret | `openssl rand -hex 32 \| wrangler secret put MYRA_HUB_SECRET` (then re-enroll all instances) |
| Disable dev login | `wrangler deploy` (without `--var MYRA_HUB_DEV_LOGIN:1`) |
| Revoke an instance | `curl -XPOST -H "authorization: Bearer $TOKEN" $HUB/api/instances/<id>/revoke` |
| Delete the Worker | `wrangler delete` |

## 8. What's where

| Thing | Lives in | Secret? | In git? |
|---|---|---|---|
| `MYRA_HUB_SECRET` | Cloudflare secret store | yes | no |
| `MYRA_HUB_DEV_LOGIN` | Worker var (deploy flag) | no | no |
| KV namespace id | `wrangler.toml` | no | yes |
| DO + Worker code | `packages/hub/src/cf/` | no | yes |
| Instance credential | `~/.myra-agents[-demo]/hub-credential.json` on each machine | yes | no |
