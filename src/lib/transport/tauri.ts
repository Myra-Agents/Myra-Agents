import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

import type { Transport, UnlistenFn } from "./types";

/**
 * Desktop transport — the in-process Tauri (Rust) backend. Until the Node
 * sidecar lands (Phase 5) this serves every command, data + agent + OS. From
 * Phase 5 the data/agent commands move to the sidecar (HTTP transport) and
 * this transport shrinks to OS file-open helpers + events.
 */
export const tauriTransport: Transport = {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return tauriInvoke<T>(cmd, args);
  },
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
    return tauriListen<T>(event, handler) as Promise<UnlistenFn>;
  },
};
