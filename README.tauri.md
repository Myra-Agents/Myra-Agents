# Studio Admin — Tauri v2 desktop

Desktop wrapper around the [`next-shadcn-admin-dashboard`](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) template,
shipped as a standalone Windows app via **Tauri v2**.

The Next.js frontend is built as a **static export** (`output: 'export'`), so the
shipped binary contains no Node runtime — Tauri serves the prebuilt HTML/JS
straight from the WebView2.

## Prerequisites

- Node ≥ 20
- Rust toolchain (`rustup`, `cargo`)
- Windows + WebView2 runtime (preinstalled on Win11)

## Develop

```powershell
npm install
npm run tauri:dev      # launches Next dev server + Tauri window
```

## Build installers

```powershell
npm run tauri:build
```

Outputs (in `src-tauri/target/release/bundle/`):
- `msi/Studio Admin_<version>_x64_en-US.msi`
- `nsis/Studio Admin_<version>_x64-setup.exe`

## Customizations vs upstream

- `next.config.mjs` → `output: "export"`, `trailingSlash: true`, `images.unoptimized: true`,
  `redirects()` removed (static export incompatible).
- `src/server/server-actions.ts` deleted; `preferences-storage.ts` now persists
  via client-side cookies/localStorage only.
- `src/app/(main)/dashboard/layout.tsx` and `src/app/(main)/mail/page.tsx` no
  longer read server cookies — they fall back to `PREFERENCE_DEFAULTS` /
  `DEFAULT_MAIL_LAYOUT`, then the client preferences store rehydrates.
- `src/app/(main)/auth/` removed (no backend in a static desktop build); sidebar
  "Authentication" entry stripped from `src/navigation/sidebar/sidebar-items.ts`.
- `src/app/(main)/dashboard/[...not-found]/` removed (catch-all routes need
  `generateStaticParams` under `output: 'export'`).
- Root `/` and `/dashboard` pages converted to client-side `router.replace`
  redirects (server `redirect()` doesn't run in a static build).
- `src-tauri/` added: identifier `com.w123982.studioadmin`, window 1400×900
  (min 1024×700), bundle targets `msi` + `nsis`.
