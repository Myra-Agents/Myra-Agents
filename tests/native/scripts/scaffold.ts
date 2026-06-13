#!/usr/bin/env bun
// scaffold.ts — register a new app in the test library.
//
// Usage:
//   bun scripts/scaffold.ts <slug> "<Window Title>" ["Display Name"]
//
// Creates apps/<slug>/{app.config.ts, components/example.test.ts} from the
// _template, substituting the window title, then refreshes apps.index.json.

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const TPL = join(ROOT, "apps", "_template");

const slug = process.argv[2];
const windowTitle = process.argv[3];
const displayName = process.argv[4] || windowTitle;

if (!slug || !windowTitle) {
  console.error('usage: bun scripts/scaffold.ts <slug> "<Window Title>" ["Display Name"]');
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(`slug must be kebab-case ([a-z0-9-]): got "${slug}"`);
  process.exit(2);
}
if (slug === "_template") {
  console.error('"_template" is reserved');
  process.exit(2);
}

const appDir = join(ROOT, "apps", slug);
const exists = await stat(appDir).then(() => true).catch(() => false);
if (exists) {
  console.error(`apps/${slug} already exists — pick another slug or edit it directly`);
  process.exit(1);
}

const subst = (s: string) =>
  s.replaceAll("__WINDOW_TITLE__", windowTitle)
    .replaceAll("__APP_NAME__", displayName)
    .replaceAll("__SLUG__", slug);

await mkdir(join(appDir, "components"), { recursive: true });
await writeFile(
  join(appDir, "app.config.ts"),
  subst(await readFile(join(TPL, "app.config.ts.tmpl"), "utf8")),
);
await writeFile(
  join(appDir, "components", "example.test.ts"),
  subst(await readFile(join(TPL, "components", "example.test.ts.tmpl"), "utf8")),
);

console.log(`✓ created apps/${slug}/ (window: "${windowTitle}")`);

// refresh the index
const { buildIndex } = await import("./index.ts");
await buildIndex();

console.log(`\nNext:\n  bun scripts/inspect.ts "${windowTitle}"   # explore the AX tree\n  edit apps/${slug}/components/example.test.ts\n  bun test apps/${slug}`);
