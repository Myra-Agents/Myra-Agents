import { type Store, UnknownCommandError } from "@myra/shared";

import { spawn } from "node:child_process";
import { homedir, platform } from "node:os";

/**
 * OS-adjacent commands (`OS_COMMANDS`): reveal a path / a card's working
 * directory in the host's file manager. On the desktop the server runs as a
 * sidecar in the user's own session on 127.0.0.1, so spawning the platform
 * opener surfaces a window on their machine — the same effect the old Tauri
 * `open_path` had. Self-host/cloud open on the server host (only meaningful
 * when that host has a desktop; harmless otherwise).
 */
function platformOpener(target: string): { cmd: string; args: string[] } {
  switch (platform()) {
    case "darwin":
      return { cmd: "open", args: [target] };
    case "win32":
      // `start` is a cmd builtin; the empty title arg avoids it eating the path.
      return { cmd: "cmd", args: ["/c", "start", "", target] };
    default:
      return { cmd: "xdg-open", args: [target] };
  }
}

function openPath(target: string): void {
  const { cmd, args } = platformOpener(target);
  // Detached + unref'd so the opener's lifetime is independent of the request.
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.unref();
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir() ?? ".";
}

/**
 * Resolve and open a card's working directory, mirroring the old Rust
 * `open_card_working_dir`: per-card dir → preset dir → home. Returns the
 * resolved directory.
 */
async function openCardWorkingDir(store: Store, cardId: string): Promise<string> {
  const cards = await store.getCards();
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Card not found: ${cardId}`);

  const settings = await store.getSettings();
  const preset = settings.agents.find((p) => p.id === (card.agentPresetId ?? settings.defaultAgentId));

  const dir = card.workingDir?.trim() || preset?.workingDir?.trim() || homeDir();
  openPath(dir);
  return dir;
}

/**
 * Dispatch an OS command against the store. The `/rpc/:cmd` route tries this
 * after `dispatchData` and before the agent runner. Throws
 * {@link UnknownCommandError} for anything it does not handle.
 */
export async function dispatchOs<T>(store: Store, cmd: string, args?: Record<string, unknown>): Promise<T> {
  const a = args ?? {};
  switch (cmd) {
    case "open_path":
      openPath(String(a.path));
      return undefined as T;
    case "open_card_working_dir":
      return (await openCardWorkingDir(store, String(a.cardId))) as T;
    default:
      throw new UnknownCommandError(cmd);
  }
}
