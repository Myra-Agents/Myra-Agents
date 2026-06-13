# AX test home (vendored)

This folder was **vendored into your app repo by the [`tauri-ax-test`](https://github.com/Myra-Agents/skills/tree/main/skills/tauri-ax-test)
skill**. It is a self-contained, generic harness for driving a native macOS app
(Tauri / Electron / WKWebView) through the **accessibility (AX) tree** — no pixel
clicks — plus this app's own test suites.

```
.tauri-ax.json            # discovery marker (don't delete)
scripts/
  ax-driver.js            # JXA core — runs a flow in one osascript pass
  ax.ts                   # typed Flow builder (imported as @ax)
  inspect.ts              # AX-tree dumper for authoring
  scaffold.ts             # register a new app
  index.ts                # (re)generate apps.index.json
apps/
  _template/              # scaffold source (.tmpl)
  <slug>/                 # one entry per app under test
    app.config.ts         # window title
    components/*.test.ts   # the reusable test library
apps.index.json           # generated: app -> window title -> components + tests
```

You normally don't run anything by hand — the `tauri-ax-test` skill drives this
for you. For reference, the commands it runs:

```bash
bun scripts/inspect.ts "<Window Title>"        # explore the live AX tree
bun scripts/scaffold.ts <slug> "<Window Title>" # register a new app
bun test                                       # run every suite (non-destructive)
bun test apps/<slug>                           # one app
DESTRUCTIVE=1 bun test                         # include persisting tests
bun scripts/index.ts                           # refresh apps.index.json
```

Requirements: macOS, [Bun](https://bun.sh), and Accessibility permission for the
process that launches the tests. The app under test must be running.

To pull harness fixes from the skill, re-vendor `harness/` (your `apps/` and
`apps.index.json` are yours — keep them).
