#!/usr/bin/env node
// Compile the @myra/server Bun app into a single self-contained binary that
// Tauri bundles + supervises as the desktop "local" connection sidecar.
//
// Tauri's `externalBin` resolves a sidecar by appending the host target triple
// (and `.exe` on Windows) to the configured base name, so the output file MUST
// be named `myra-server-<rust-host-triple>[.exe]`. We read the triple straight
// from `rustc -Vv` so it always matches what Tauri expects on this machine.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "binaries");
const entry = join(root, "packages", "server", "src", "index.ts");

function hostTriple() {
  const out = execFileSync("rustc", ["-Vv"], { encoding: "utf8" });
  const line = out.split("\n").find((l) => l.startsWith("host:"));
  if (!line) throw new Error("could not parse host triple from `rustc -Vv`");
  return line.slice("host:".length).trim();
}

const triple = hostTriple();
const isWindows = triple.includes("windows");
const outfile = join(outDir, `myra-server-${triple}${isWindows ? ".exe" : ""}`);

mkdirSync(outDir, { recursive: true });

console.log(`[build-sidecar] compiling ${entry}\n            -> ${outfile}`);

const res = spawnSync(
  "bun",
  ["build", "--compile", entry, "--outfile", outfile],
  { stdio: "inherit", cwd: root },
);

if (res.status !== 0) {
  console.error("[build-sidecar] bun build --compile failed");
  process.exit(res.status ?? 1);
}

console.log("[build-sidecar] done");
