import type { AgentExecutor, RunHandle, RunHooks, SpawnJob } from "./executor";

/**
 * Cloud executor skeleton (`MYRA_EXECUTOR=sandbox`). Implements the same
 * {@link AgentExecutor} contract as {@link LocalProcessExecutor}, but instead of
 * spawning on the host it is meant to provision an isolated sandbox
 * (container / microVM), `git clone` the target repo into it, run the agent
 * inside, stream stdout/stderr back through {@link RunHooks.onLine}, and read
 * the result file out of the sandbox on exit.
 *
 * The isolation technology (Docker vs Firecracker/gVisor vs a hosted sandbox
 * API), repo-clone credentials, and per-run secret injection are all deferred —
 * see the cloud risks in `docs/multi-server-backend-plan.md`. This stub keeps
 * the seam in place and selectable so the rest of the runner is sandbox-ready;
 * it throws on use so a misconfigured deployment fails loudly rather than
 * silently falling back to running agents on the server host.
 */
export class SandboxExecutor implements AgentExecutor {
  run(_job: SpawnJob, _hooks: RunHooks): RunHandle {
    throw new Error(
      "SandboxExecutor is not implemented yet. Set MYRA_EXECUTOR=local (or unset it) to run agents on the server host.",
    );
  }
}
