# Clerk authentication — setup guide

Myra uses **Clerk** to prove who a user is. Clerk only handles the login; the
hub then issues its **own** short session JWT + a long, revocable refresh token,
so the connector and the Tauri webview never depend on Clerk's SDK. This doc
covers wiring Clerk for local dev and production, plus the env/KV the hub needs.

> Architecture recap: web signs in in-page (Clerk hosted → redirect back →
> `POST /auth/exchange`). Desktop opens the system browser at the hosted
> `/auth/desktop/` bridge, which mints a one-time code and deep-links
> `myra://auth/callback?code=…` back into the app. Both land at the same hub
> `/auth/exchange`. See `docs/centralized-hub-plan.md` and `docs/hub-deploy.md`.

---

## 0. What you'll end up setting

| Where | Variable | Example |
|---|---|---|
| Frontend build | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` / `pk_live_…` |
| Frontend build | `NEXT_PUBLIC_MYRA_HUB_URL` | `https://myra-hub.<you>.workers.dev` |
| Frontend build | `NEXT_PUBLIC_CLERK_JWT_TEMPLATE` *(recommended)* | `myra-hub` |
| Desktop binary (build/runtime) | `MYRA_WEB_APP_URL` | `https://app.yourdomain.com` |
| Hub (`wrangler.toml [vars]`) | `CLERK_ISSUER` | `https://your-app.clerk.accounts.dev` |
| Hub (`wrangler.toml [vars]`) | `CLERK_JWKS_URL` | `https://your-app.clerk.accounts.dev/.well-known/jwks.json` |
| Hub (`wrangler.toml [vars]`) | `CLERK_AUDIENCE` *(only if your template sets `aud`)* | `myra-hub` |
| Hub (secret) | `MYRA_HUB_SECRET` | 32+ random bytes |
| Hub (KV) | `PAIRING`, `ACCOUNTS`, `AUTH` | namespace ids |

There is **no** `CLERK_SECRET_KEY` here — the hub never calls Clerk's backend
API; it only verifies Clerk JWTs offline against the public JWKS.

---

## 1. Create the Clerk application

1. Sign up at <https://dashboard.clerk.com> and **Create application**.
2. Pick the sign-in methods you want (email + Google/GitHub etc.). Defaults are
   fine.
3. You now have a **development instance** automatically. Production is a
   separate instance you promote to later (§6).

### Get the keys / URLs

- **Publishable key** — Dashboard → **API Keys** → `pk_test_…`. This is
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- **Issuer / Frontend API** — Dashboard → **API Keys** (or **Domains**). For a
  dev instance it looks like `https://your-app-123.clerk.accounts.dev`. This is
  `CLERK_ISSUER` (it equals the `iss` claim Clerk puts in every token).
- **JWKS URL** — always `${CLERK_ISSUER}/.well-known/jwks.json`. This is
  `CLERK_JWKS_URL`.

> Tip: confirm the issuer by decoding any Clerk token at <https://jwt.io> and
> reading its `iss` claim — `CLERK_ISSUER` must match exactly.

---

## 2. JWT template (recommended)

The **default** Clerk session token carries `sub` but **not** the user's email,
and org claims only when an org is active. To get a stable, predictable token
(email for the account UI, explicit org claims), create a JWT template.

Dashboard → **JWT Templates** → **New template**:

- **Name:** `myra-hub`  ← this is `NEXT_PUBLIC_CLERK_JWT_TEMPLATE`
- **Claims:**
  ```json
  {
    "email": "{{user.primary_email_address}}",
    "org_id": "{{org.id}}",
    "org_role": "{{org.role}}"
  }
  ```
- **Token lifetime:** default (60s) is fine — the client exchanges it
  immediately.
- **Audience (optional):** if you want audience enforcement, add `"aud":
  "myra-hub"` to the claims above and set `CLERK_AUDIENCE=myra-hub`. Otherwise
  leave `CLERK_AUDIENCE` unset.

The hub reads these in `packages/hub/src/core/clerk.ts → deriveAccount`:
`email`, `org_id`/`org_role` (or Clerk's newer `o.{id,rol}` object), and maps an
`org_role` containing `admin` → `role: "admin"`.

If you skip the template, leave `NEXT_PUBLIC_CLERK_JWT_TEMPLATE` unset — auth
still works, but `account.email` will be empty and org claims only appear when an
org is active.

---

## 3. Configure redirect URLs / allowed origins

Clerk must trust the URLs we redirect back to after hosted sign-in.

Dashboard → **Paths** / **Domains → Allowed origins / redirect URLs**, add:

- `http://localhost:1420` — Next dev server (web dev + the desktop bridge in dev)
- your production web app origin, e.g. `https://app.yourdomain.com`
- the bridge page, e.g. `https://app.yourdomain.com/auth/desktop`

The web sign-in passes `signInForceRedirectUrl = window.location.href`
(`src/lib/auth/clerk.ts`), so the current page must be an allowed redirect.

---

## 4. Configure the hub (Cloudflare Worker)

In `packages/hub/`:

```bash
# KV namespaces (paste each returned id into wrangler.toml)
wrangler kv namespace create PAIRING
wrangler kv namespace create ACCOUNTS
wrangler kv namespace create AUTH

# hub signing secret (signs the hub's own session/instance JWTs)
openssl rand -hex 32 | wrangler secret put MYRA_HUB_SECRET
```

Edit `packages/hub/wrangler.toml`:

```toml
[vars]
CLERK_ISSUER = "https://your-app-123.clerk.accounts.dev"
CLERK_JWKS_URL = "https://your-app-123.clerk.accounts.dev/.well-known/jwks.json"
# CLERK_AUDIENCE = "myra-hub"   # only if the JWT template sets aud

# CORS: add your hosted web app origin so the browser can call the hub.
# MYRA_CORS_ORIGIN = "https://app.yourdomain.com,http://localhost:1420,tauri://localhost,https://tauri.localhost,http://tauri.localhost"

[[kv_namespaces]]
binding = "PAIRING"
id = "…"
[[kv_namespaces]]
binding = "ACCOUNTS"
id = "…"
[[kv_namespaces]]
binding = "AUTH"
id = "…"
```

Then `wrangler deploy`. (The defaults already allowlist `localhost:1420` + the
Tauri origins; only add `MYRA_CORS_ORIGIN` when you host the web app on its own
domain.)

---

## 5. Configure the clients

### Web app (Next static export)

Set build-time env (e.g. `.env.local` for dev, CI env for prod):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
NEXT_PUBLIC_MYRA_HUB_URL=https://myra-hub.<you>.workers.dev
NEXT_PUBLIC_CLERK_JWT_TEMPLATE=myra-hub          # if you made the template
```

Host the exported site somewhere with a stable URL (Cloudflare Pages works).
The `/auth/desktop/` bridge route ships automatically in the static export.

### Desktop app (Tauri)

The desktop opens the **hosted** web app's bridge page in the system browser.
Set, at build/runtime of the Tauri binary:

```
MYRA_WEB_APP_URL=https://app.yourdomain.com
```

(Falls back to `https://app.myra-agents.com` if unset — change that default in
`src-tauri/src/lib.rs::web_app_url` if you prefer.) The frontend bundled into the
desktop app still needs the `NEXT_PUBLIC_*` vars above at build time.

---

## 6. Local dev quickstart

1. Run the hub locally: `cd packages/hub && wrangler dev` (or deploy a dev
   Worker). Point `NEXT_PUBLIC_MYRA_HUB_URL` at it.
2. `bun run dev` → open `http://localhost:1420`. As a non-signed-in web user you
   get the upsell screen → **Sign in** → Clerk hosted → back to the board.
3. For desktop: `bun run tauri:dev` with `MYRA_WEB_APP_URL=http://localhost:1420`
   and `http://localhost:1420/auth/desktop` added to Clerk allowed origins. The
   `myra://` scheme is registered from `tauri.conf.json` (macOS) / at runtime
   (Win/Linux).

> Pure-local, no-Clerk testing: the **Node** hub host (`packages/hub` `bun run
> dev`) keeps a gated dev-login. Start it with `MYRA_HUB_DEV_LOGIN=1` and any
> `POST /auth/login {userId}` mints a pro session. The Cloudflare host has **no**
> dev login.

---

## 7. Promote to production

1. In Clerk, create/active the **production instance**, attach your domain, redo
   §1–§3 with the `pk_live_…` key and the production issuer/JWKS.
2. Re-run §4 against your production Worker (separate KV ids + secret).
3. Rebuild the web app + desktop binary with the production `NEXT_PUBLIC_*` /
   `MYRA_WEB_APP_URL`.

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/auth/exchange` → 401 "invalid identity token" | `CLERK_ISSUER`/`CLERK_JWKS_URL` mismatch, or `CLERK_AUDIENCE` set but the token has no/!= `aud`. |
| Board never appears after web sign-in | redirect URL not allow-listed in Clerk, or `NEXT_PUBLIC_MYRA_HUB_URL` wrong / CORS blocked (check `MYRA_CORS_ORIGIN`). |
| `account.email` empty | no JWT template — add one (§2) and set `NEXT_PUBLIC_CLERK_JWT_TEMPLATE`. |
| Desktop never returns from browser | `myra://` not registered (rebuild after adding the plugin), or `MYRA_WEB_APP_URL` points somewhere without the bridge page. |
| CORS preflight fails | add your web origin to `MYRA_CORS_ORIGIN` and redeploy the Worker. |
| Everyone is `free` | expected — tier is not billed yet; see "Removing the tier stub" below. |

---

## Removing the tier (billing) stub

Today every account defaults to `tier: "free"`; **Pro is granted manually**:

```bash
# one user → pro
wrangler kv key put --binding ACCOUNTS "acct:clerk:<clerkUserId>" \
  '{"userId":"clerk:<clerkUserId>","tier":"pro","role":"member"}'
```

`deriveAccount` (`packages/hub/src/core/clerk.ts`) **preserves** the stored
`tier` on every login, so a manual upgrade sticks. The only stub is *how* `tier`
gets set. Two ways to make it real:

### Option A — Clerk Billing (recommended, least code)

Clerk now ships Billing (plans + Stripe under the hood). The plan rides in the
token, so the hub stays offline-verify-only.

1. Clerk Dashboard → **Billing** → enable, create a **Pro** plan, wire Stripe.
2. Add the plan to your JWT template claims, e.g.:
   ```json
   { "plan": "{{user.public_metadata.plan}}" }
   ```
   (Exact source depends on how Clerk Billing exposes the plan — a billing claim
   or `public_metadata` you sync from a Stripe webhook to Clerk.)
3. In `deriveAccount`, derive tier from the claim instead of defaulting:
   ```ts
   const tier: Tier = payload.plan === "pro" ? "pro" : (existing?.tier ?? "free");
   ```
4. Drop the manual KV step. Done — tier follows the subscription on every login,
   and on `/auth/refresh` (refresh re-reads the account; if you want instant
   downgrades, also re-derive on refresh from a fresh token).

### Option B — Stripe webhook → hub

If you bill with Stripe directly (no Clerk Billing):

1. Add a Worker route `POST /billing/webhook` verifying the Stripe signature.
2. On `checkout.session.completed` / `customer.subscription.updated|deleted`,
   map the Stripe customer → your `userId` (store the mapping at checkout) and
   `ACCOUNTS.upsert({ …, tier })`.
3. Keep `deriveAccount` preserving the stored tier (already does).

Option A is less moving parts since Clerk is already the identity source.

### Still-stub, separate follow-ups (not "billing")

- **Org enforcement.** `role`/`orgId` are real claims now but unused for access
  control. "Admin sees all org instances" needs a hub org layer — today the
  Durable Object is keyed per `userId` (`idFromName(userId)`); an org-scoped DO
  or a userId↔org index is required. Tracked in `REFACTOR.md`.
- **Desktop single-instance.** On Windows/Linux, pair `tauri-plugin-deep-link`
  with the single-instance plugin so a second launch forwards the `myra://` URL
  to the running app instead of starting a new one. macOS already routes it.
