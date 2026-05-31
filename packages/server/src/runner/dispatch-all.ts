import { dispatchData, type Store, UnknownCommandError } from "@myra/shared";

import type { AgentRunner } from "./agent-runner";
import { dispatchAgent } from "./dispatch";
import { dispatchOs } from "./os";

/**
 * Run a command through the server's three dispatch layers, in order: data CRUD
 * against the store → OS file-open helpers → the agent runner. Each layer
 * rethrows {@link UnknownCommandError} so the next gets a try; if the last one
 * misses too, that error propagates (callers map it to HTTP 400 / an rpc-result
 * error).
 *
 * Shared by the HTTP `/rpc/:cmd` route and the hub connector so the two entry
 * points can never drift.
 */
export async function dispatchCommand(
  store: Store,
  runner: AgentRunner,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await dispatchData(store, cmd, args);
  } catch (errData) {
    if (!(errData instanceof UnknownCommandError)) throw errData;
    try {
      return await dispatchOs(store, cmd, args);
    } catch (errOs) {
      if (!(errOs instanceof UnknownCommandError)) throw errOs;
      return await dispatchAgent(runner, cmd, args);
    }
  }
}
