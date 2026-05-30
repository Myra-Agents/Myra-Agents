import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** A resolved process to spawn: binary + argv + working directory. */
export interface SpawnJob {
  binary: string;
  args: string[];
  cwd: string;
}

/** Callbacks the runner wires to a spawned agent process. */
export interface RunHooks {
  onLine(stream: "out" | "err", line: string): void;
  onExit(code: number | null): void;
}

/** A handle to a running agent process; lets the runner cancel it. */
export interface RunHandle {
  pid?: number;
  cancel(): Promise<void>;
}

/**
 * Spawns and supervises a single agent process. The local executor used by
 * the desktop sidecar and self-hosted server (the cloud sandbox executor will
 * implement this same interface). Port of `agent.rs`'s spawn + line-reader
 * threads + `taskkill` cancellation.
 */
export interface AgentExecutor {
  run(job: SpawnJob, hooks: RunHooks): RunHandle;
}

export class LocalProcessExecutor implements AgentExecutor {
  run(job: SpawnJob, hooks: RunHooks): RunHandle {
    const child = spawn(job.binary, job.args, {
      cwd: job.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (child.stdout) {
      const out = createInterface({ input: child.stdout });
      out.on("line", (line) => hooks.onLine("out", line));
    }
    if (child.stderr) {
      const err = createInterface({ input: child.stderr });
      err.on("line", (line) => hooks.onLine("err", line));
    }

    let exited = false;
    const finish = (code: number | null) => {
      if (exited) return;
      exited = true;
      hooks.onExit(code);
    };
    // `close` fires after stdio is drained; `error` (e.g. ENOENT) means the
    // binary never started — surface it as a non-zero exit so the run fails.
    child.on("close", (code) => finish(code));
    child.on("error", () => finish(-1));

    return {
      pid: child.pid,
      async cancel() {
        if (child.pid === undefined) return;
        if (process.platform === "win32") {
          // Kill the whole tree on Windows, mirroring the Rust `taskkill`.
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          try {
            child.kill("SIGKILL");
          } catch {
            // Already gone.
          }
        }
      },
    };
  }
}
