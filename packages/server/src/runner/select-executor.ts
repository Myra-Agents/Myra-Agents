import { type AgentExecutor, LocalProcessExecutor } from "./executor";
import { SandboxExecutor } from "./sandbox-executor";

/**
 * Pick the agent executor for this server from `MYRA_EXECUTOR`:
 * - `local` (default, also the sidecar + self-host case) → spawn on the host.
 * - `sandbox` → the cloud sandbox executor (skeleton, throws on use for now).
 */
export function selectExecutor(): AgentExecutor {
  const kind = process.env.MYRA_EXECUTOR?.toLowerCase();
  if (kind === "sandbox") return new SandboxExecutor();
  return new LocalProcessExecutor();
}
