---
name: validate-web-ui
description: Validate the Myra Agents web UI end-to-end with a headless browser (Playwright). Use when someone says "validate the web ui", "/validate-web-ui", "test the web app", "check the UI works", "run the web smoke test", or after changing the frontend / browser backend / data layer and wanting to confirm the board still works in the browser (bun run dev mode). Drives real clicks against the localStorage stand-in backend and reports pass/fail.
---

# Validate the Myra Agents web UI

Goal: prove the **browser** build (`bun run dev`, no Tauri) actually works — columns render, a card can be created and persists, the main routes load, and there are no unexpected console/page errors. This exercises the real client path: UI → `invoke` (`src/lib/tauri.ts`) → `browserInvoke` (`src/lib/browser-backend.ts`) → shared domain (`@myra/shared`) → localStorage.

Use this after touching anything in: `src/lib/tauri.ts`, `src/lib/browser-backend.ts`, `packages/shared/**`, `src/hooks/use-*`, the kanban components, or routing.

## What it does NOT cover

- Tauri/desktop behavior (agent runs, tray, file watcher) — those are desktop-only and throw `[Dev Mode]` in the browser by design. The runner filters those sentinels out.
- Real agent execution, schedules firing, WS events (no Node server in browser mode).

## How to run

One command — the runner handles the dev-server lifecycle (starts it if down, waits for readiness, leaves a pre-existing server running):

```bash
bun .claude/skills/validate-web-ui/run.ts
```

Prereqs (the runner checks and tells you if missing):
- `bun install` has been run.
- Playwright chromium is installed: `npx playwright install chromium`.

Exit code `0` = all checks passed; non-zero = something failed (details printed per check).

## Interpreting results

Each line is `[PASS]`/`[FAIL] <check> — <detail>`. The suite asserts:
- columns render (Draft / To Do / In Progress / Done)
- "Add card" opens the dialog; "Create" enables once a title is filled
- the new card persists to localStorage with a numeric `position`
- the card is visible on the board and survives a reload
- settings + schedules routes render
- no console errors and no page errors (excluding the documented `[Dev Mode]` sentinels)

If a **selector** breaks (UI copy changed), the failure shows the timeout + what it waited for — update `tests/web-smoke.spec.ts` to match the new label. The canonical spec lives at `tests/web-smoke.spec.ts`; this skill's `run.ts` just orchestrates the server + invokes it.

## Adding checks

Add assertions to `tests/web-smoke.spec.ts` using the `check(name, ok, detail?)` helper. Keep checks deterministic: seed/clear localStorage at the start (the spec already removes `myra-agents.dev.cards` / `.schedules`), and prefer role-based locators (`getByRole`) over brittle CSS.
