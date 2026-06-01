#!/usr/bin/env bun
/**
 * Orchestrator for the web-UI validation skill.
 *
 * - Ensures the Next dev server (port 1420) is up; starts it if not, and
 *   shuts down only the instance it started.
 * - Runs the Playwright smoke suite at tests/web-smoke.spec.ts.
 * - Propagates the suite's exit code.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 1420;
const BASE = `http://localhost:${PORT}`;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SPEC = resolve(repoRoot, "tests/web-smoke.spec.ts");

function log(msg: string) {
  console.log(`[validate-web-ui] ${msg}`);
}

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUp(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function preflight() {
  if (!existsSync(SPEC)) {
    log(`ERROR: spec not found at ${SPEC}`);
    process.exit(2);
  }
  if (!existsSync(resolve(repoRoot, "node_modules/playwright"))) {
    log("ERROR: playwright not installed. Run: bun add -D playwright && npx playwright install chromium");
    process.exit(2);
  }
}

function runSpec(): Promise<number> {
  return new Promise((res) => {
    const child = spawn("bun", [SPEC], { cwd: repoRoot, stdio: "inherit" });
    child.on("exit", (code) => res(code ?? 1));
  });
}

async function main() {
  preflight();

  let startedByUs: ReturnType<typeof spawn> | null = null;

  if (await isUp()) {
    log("dev server already running — reusing it");
  } else {
    log("starting dev server (bun run dev)…");
    startedByUs = spawn("bun", ["run", "dev"], {
      cwd: repoRoot,
      stdio: "ignore",
      detached: false,
    });
    if (!(await waitUp(60_000))) {
      log("ERROR: dev server did not become ready within 60s");
      startedByUs.kill();
      process.exit(2);
    }
    log("dev server ready");
  }

  log("running web smoke suite…");
  const code = await runSpec();

  if (startedByUs) {
    log("stopping dev server we started");
    startedByUs.kill();
  }

  log(code === 0 ? "PASS — all checks green" : `FAIL — suite exited ${code}`);
  process.exit(code);
}

main().catch((e) => {
  log(`RUNNER ERROR: ${e}`);
  process.exit(2);
});
