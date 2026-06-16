#!/usr/bin/env node
// Provision the self-contained `myra-server` binary that Tauri bundles +
// supervises as the desktop "local" connection sidecar.
//
// The server source lives in a separate (private) repo; this public app repo
// consumes a *pre-built* binary published as a GitHub Release asset. So by
// default this script DOWNLOADS the pinned binary for the host triple.
//
// Fallback: if the server source is present locally (running inside the private
// monorepo / server repo, where `packages/server/src/index.ts` exists) the
// script COMPILES from source instead — so one script serves both worlds.
//
// Tauri's `externalBin` resolves a sidecar by appending the host target triple
// (and `.exe` on Windows) to the configured base name, so the output file MUST
// be named `myra-server-<rust-host-triple>[.exe]`. We read the triple straight
// from `rustc -Vv` so it always matches what Tauri expects on this machine.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "binaries");
const serverEntry = join(root, "packages", "server", "src", "index.ts");

function hostTriple() {
  // CI cross-compile override: when building for an arch other than the host
  // (e.g. x86_64 on an Apple Silicon self-hosted runner), the bundled sidecar
  // must match the BUILD target, not the host. The Release workflow sets
  // MYRA_SERVER_TRIPLE to the cargo `--target` so Tauri's externalBin resolves
  // the right `myra-server-<triple>` asset.
  const override = process.env.MYRA_SERVER_TRIPLE;
  if (override) return override.trim();
  const out = execFileSync("rustc", ["-Vv"], { encoding: "utf8" });
  const line = out.split("\n").find((l) => l.startsWith("host:"));
  if (!line) throw new Error("could not parse host triple from `rustc -Vv`");
  return line.slice("host:".length).trim();
}

function readPin() {
  // server-version.json pins which published binary to fetch. Env overrides win
  // (handy for CI / local testing against a fork).
  let pin = {};
  const pinPath = join(root, "server-version.json");
  if (existsSync(pinPath)) pin = JSON.parse(readFileSync(pinPath, "utf8"));
  const version = process.env.MYRA_SERVER_VERSION || pin.version;
  const repo = process.env.MYRA_SERVER_REPO || pin.repo;
  const baseUrl =
    process.env.MYRA_SERVER_BASE_URL ||
    pin.baseUrl ||
    (repo && version ? `https://github.com/${repo}/releases/download/${version}` : null);
  if (!baseUrl) {
    throw new Error(
      "[build-sidecar] no download source: set server-version.json {repo,version} or MYRA_SERVER_BASE_URL",
    );
  }
  return { version: version ?? "unknown", baseUrl };
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[build-sidecar] GET ${url} -> ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const triple = hostTriple();
const isWindows = triple.includes("windows");
const assetName = `myra-server-${triple}${isWindows ? ".exe" : ""}`;
const outfile = join(outDir, assetName);
const stamp = join(outDir, `.${assetName}.version`);

mkdirSync(outDir, { recursive: true });

// --- compile path (local Rust server checkout present) ---------------------
// In the dev workspace the Rust server lives next to this app (../server). When
// it's there AND we're building for the host (not a CI cross-compile), build it
// from source so the bundled sidecar always matches local server changes — no
// pinned-release download, no manual binary copy. The public app repo has no
// ../server, so it falls through to the download path below.
const rustServerDir = join(root, "..", "server");
if (!process.env.MYRA_SERVER_TRIPLE && existsSync(join(rustServerDir, "Cargo.toml"))) {
  console.log(`[build-sidecar] local Rust server found, building\n            -> ${outfile}`);
  const res = spawnSync("cargo", ["build", "--release"], { stdio: "inherit", cwd: rustServerDir });
  if (res.status !== 0) {
    console.error("[build-sidecar] cargo build --release failed");
    process.exit(res.status ?? 1);
  }
  const built = join(rustServerDir, "target", "release", isWindows ? "myra-server.exe" : "myra-server");
  if (!existsSync(built)) {
    console.error(`[build-sidecar] built binary not found at ${built}`);
    process.exit(1);
  }
  copyFileSync(built, outfile);
  if (!isWindows) chmodSync(outfile, 0o755);
  writeFileSync(stamp, "local\n");
  console.log("[build-sidecar] done (compiled from local Rust source)");
  process.exit(0);
}

// --- compile path (server source present) ---------------------------------
if (existsSync(serverEntry)) {
  console.log(`[build-sidecar] server source found, compiling\n            -> ${outfile}`);
  const res = spawnSync("bun", ["build", "--compile", serverEntry, "--outfile", outfile], {
    stdio: "inherit",
    cwd: root,
  });
  if (res.status !== 0) {
    console.error("[build-sidecar] bun build --compile failed");
    process.exit(res.status ?? 1);
  }
  console.log("[build-sidecar] done (compiled)");
  process.exit(0);
}

// --- download path (public app) --------------------------------------------
const { version, baseUrl } = readPin();

// Cache: skip if the on-disk binary already matches the pinned version.
if (existsSync(outfile) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === version) {
  console.log(`[build-sidecar] ${assetName} already at ${version}, skipping`);
  process.exit(0);
}

console.log(`[build-sidecar] downloading ${assetName} @ ${version}\n            from ${baseUrl}`);

const bin = await download(`${baseUrl}/${assetName}`);

// Verify checksum when the .sha256 sidecar asset is available.
try {
  const sumText = (await download(`${baseUrl}/${assetName}.sha256`)).toString("utf8");
  const expected = sumText.trim().split(/\s+/)[0].toLowerCase();
  const actual = sha256(bin);
  if (expected !== actual) {
    console.error(`[build-sidecar] checksum mismatch\n  expected ${expected}\n  actual   ${actual}`);
    process.exit(1);
  }
  console.log("[build-sidecar] checksum ok");
} catch (e) {
  console.warn(`[build-sidecar] checksum skipped: ${e.message}`);
}

writeFileSync(outfile, bin);
if (!isWindows) chmodSync(outfile, 0o755);
writeFileSync(stamp, `${version}\n`);

console.log("[build-sidecar] done (downloaded)");
