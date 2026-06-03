# Contributing to Myra Agents

Thanks for your interest in improving Myra Agents! This guide covers setup and
the contribution flow.

## Setup

```bash
git clone --recurse-submodules https://github.com/Gamma-Software/Myra-Agents.git
cd Myra-Agents
bun install
bun run tauri:dev   # or `bun run dev` for frontend-only in a browser
```

If you cloned without `--recurse-submodules`, run `git submodule update --init`
to fetch `packages/shared`.

**Prerequisites:** bun, the Rust toolchain, and the
[Tauri v2 OS prerequisites](https://v2.tauri.app/start/prerequisites/).

## Project layout

- `src/` — Next.js frontend (App Router). Routes in `app/(main)`; one hook per
  concern in `hooks/`; shadcn-style primitives in `components/ui/`.
- `src-tauri/` — Tauri v2 (Rust) desktop shell + sidecar supervision.
- `packages/shared/` — submodule of
  [Myra-Agents-Shared](https://github.com/Gamma-Software/Myra-Agents-Shared);
  shared types/contracts. Changes there land in that repo, then bump the
  submodule pointer here.
- `scripts/build-sidecar.mjs` — downloads the pre-built server sidecar binary.

## Conventions

- TypeScript over `any`; reuse existing utilities before adding deps.
- Every user-facing string goes through `next-intl` — add keys to **both**
  `src/messages/en.json` and `src/messages/fr.json`.
- Rust↔TS payloads use `camelCase` (`#[serde(rename_all = "camelCase")]`);
  mirror field names exactly in `src/types/`.
- Format/lint with biome (`bun run check:fix`). Husky + lint-staged enforce on commit.

## Verification gates

Run before opening a PR:

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npx biome check
```

## Flow

1. Branch: `git checkout -b feature/my-update`.
2. Conventional commits: `feat:`, `fix:`, `chore:`, etc.
3. Open a PR against `main`; include a screenshot for UI changes and reference
   any related issue.

Report bugs and ideas via [GitHub Issues](https://github.com/Gamma-Software/Myra-Agents/issues).
