import { type FSWatcher, watch } from "chokidar";

import type { AgentRunner } from "./runner/agent-runner";
import { resolveDataDir } from "./store/file-store";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Filesystem backstop for the result protocol. The runner's `onExit` reads the
 * result file as the canonical path; this watcher covers cases where an agent
 * writes the file and the process exit signal is missed (or the file lands
 * after a delay). Both call the same idempotent `handleResultFile`.
 * Port of `watcher.rs::spawn_watcher`.
 */
export function startWatcher(runner: AgentRunner, dataDir: string = resolveDataDir()): FSWatcher {
  const resultsDir = join(dataDir, "agent-results");
  mkdirSync(resultsDir, { recursive: true });

  const watcher = watch(resultsDir, { ignoreInitial: true, depth: 0 });
  const onFile = (path: string) => {
    if (path.endsWith(".json")) void runner.handleResultFile(path);
  };
  watcher.on("add", onFile).on("change", onFile);
  return watcher;
}
