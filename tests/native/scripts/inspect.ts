#!/usr/bin/env bun
// inspect.ts — dump the live AX tree of the app window, for authoring tests.
//
// Usage:
//   bun scripts/inspect.ts "Myra Agents"            # interesting nodes only
//   bun scripts/inspect.ts "Myra Agents" --all      # every node + geometry
//
// This is the standalone equivalent of the macos_automator MCP's tree dump —
// use whichever you have. Read the tree, pick stable role+name/label anchors,
// then write a flow in a *.test.ts with the `app()` builder from ./ax.

import { app } from "./ax";

const title = process.argv[2];
if (!title) {
  console.error('usage: bun scripts/inspect.ts "<window title>" [--all]');
  process.exit(2);
}
const maxDepth = process.argv.includes("--all") ? 40 : 24;

const r = await app(title).dump("tree", maxDepth).run();
if (!r.ok) {
  console.error("inspect failed:");
  for (const s of r.steps) if (!s.ok) console.error(`  ✗ ${s.op}: ${s.error}`);
  process.exit(1);
}
console.log(r.reads.tree ?? "(empty)");
