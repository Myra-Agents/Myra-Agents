---
name: validate-tauri-app
description: Validate the Myra Agents Tauri desktop app on macOS — type-check, Rust compile gates, and a real-window screenshot. Use when someone says "validate the tauri app", "/validate-tauri-app", "test the desktop app", "check the desktop build", "screenshot the app window", or after changing src-tauri Rust code, the Tauri config, or anything that affects the desktop build. Complements validate-web-ui (which covers the browser build).
---

# Validate the Myra Agents Tauri (desktop) app

Goal: catch desktop-build breakage and visually confirm the real window renders. On macOS there is **no WKWebView WebDriver** (Apple ships none; `tauri-driver` supports only Linux/Windows), so full in-webview click automation isn't available here. This skill does the automatable ceiling: compile gates + launch the real app + screenshot it.

For in-webview click-through, use the **`validate-web-ui`** skill — it drives the same React UI in a plain browser (the data layer is shared via `@myra/shared`), so most frontend behavior is already covered there. This skill is for the *desktop-specific* surface: that it compiles, links, launches, and the frameless window / traffic lights / tray actually render.

## How to run

```bash
.claude/skills/validate-tauri-app/run.sh                 # gates + screenshot
.claude/skills/validate-tauri-app/run.sh --build         # also cargo build (slow)
.claude/skills/validate-tauri-app/run.sh --no-screenshot # gates only (headless, CI-safe)
.claude/skills/validate-tauri-app/run.sh --keep-open     # leave the app running after
```

What it does:
1. **tsc --noEmit** — frontend types.
2. **cargo check** (`src-tauri/`) — Rust backend compiles.
3. **cargo build** — only with `--build` (linking/bundling sanity).
4. **Launch + screenshot** — runs `bun run tauri:dev`, waits for the window (via the Accessibility API, up to 180s since the first run compiles Rust), grabs its bounds, and `screencapture`s the region into `.claude/skills/validate-tauri-app/artifacts/tauri-window-<timestamp>.png`. Then it tears down the dev process + the Next dev server on port 1420.

**Exit code:** gates 1–2 (and 3 with `--build`) decide it. The screenshot is best-effort and never fails the run.

## macOS permissions (one-time, manual)

The screenshot step needs the terminal to hold two permissions — grant once in **System Settings → Privacy & Security**:
- **Screen Recording** — for `screencapture` to capture window pixels (without it the PNG is tiny/black; the skill warns).
- **Accessibility** — for `osascript`/System Events to read the window's position+size.

If these aren't granted, the gates still run and pass; only the screenshot is skipped with a clear warning. These cannot be granted programmatically.

## Inspecting the result

The skill prints the PNG path. View it to confirm: window opened, correct size (~1280×900), frameless chrome with macOS traffic-light controls inset, sidebar + board rendered, no white/blank screen or error overlay. Send it to the user with the screenshot tool when reporting.

## Limits / future

- No automated assertions on the screenshot (it's for human/visual review). Could add image-diff against a golden later.
- For real desktop click-through automation, the future option is a WKWebView WebDriver bridge (e.g. `tauri-webdriver` / `tauri-plugin-webdriver`) added as a debug-only plugin — deferred until the desktop surface grows (Phase 5 of the multi-server backend plan, `docs/multi-server-backend-plan.md`).
- Process matching tries names `"Myra Agents"` then `"app"` (the Cargo bin name in dev). If the dev process name changes, update `CANDIDATES` in `run.sh`.
