import type { UnlistenFn } from "@tauri-apps/api/event";

export type { UnlistenFn };

/**
 * One transport per connection — how the client talks to a single backend.
 * Mirrors the old `invoke`/`listen` shape so the seam stays drop-in.
 */
export interface Transport {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
}
