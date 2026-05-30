import { UnknownCommandError } from "@myra/shared";

import { planDay } from "../routes/planner";
import type { AgentRunner } from "./agent-runner";

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Run an agent/OS-adjacent command against the runner — the shell+filesystem
 * commands (`AGENT_COMMANDS`) that `dispatchData` rejects. The `/rpc/:cmd`
 * route falls back here when `dispatchData` throws {@link UnknownCommandError}.
 * Throws {@link UnknownCommandError} again for anything unknown → HTTP 400.
 */
export async function dispatchAgent<T>(runner: AgentRunner, cmd: string, args?: Record<string, unknown>): Promise<T> {
  const a = args ?? {};
  const result: unknown = await (async () => {
    switch (cmd) {
      case "launch_agent": {
        // Tolerate both `{ input: { cardId, workingDir } }` and a flat shape.
        const input = ((a.input as Record<string, unknown> | undefined) ?? a) as Record<string, unknown>;
        return runner.launch(String(input.cardId), optStr(input.workingDir));
      }
      case "cancel_agent":
        return runner.cancel(String(a.cardId));
      case "get_run_log":
        return runner.getRunLog(String(a.runId));
      case "list_run_artifacts":
        return runner.listRunArtifacts(String(a.cardId));
      case "trigger_schedule_now":
        return runner.triggerScheduleNow(String(a.id));
      case "plan_day":
        return planDay(String(a.objectives), optStr(a.workingDir));
      default:
        throw new UnknownCommandError(cmd);
    }
  })();
  return result as T;
}
