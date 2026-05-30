import { isTauri as tauriIsTauri } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { connectionManager } from "@/lib/connections/manager";

/**
 * Client seam. Public surface is unchanged (`invoke`/`listen`/`isTauri`/
 * `isDevModeError`), but calls now route through the ConnectionManager's
 * primary connection instead of branching on `isTauri()` inline. Phase 4
 * turns this single-connection routing into fan-out/merge across N servers.
 */

/**
 * Returns true when running inside the Tauri webview.
 * In a regular browser (e.g. `next dev` without Tauri), returns false.
 */
export function isTauri(): boolean {
  return tauriIsTauri();
}

/** Check if an error is the dev-mode "not in Tauri" message. */
export function isDevModeError(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith("[Dev Mode]");
}

/**
 * Invoke a backend command on the primary connection. Resolves against the
 * in-process Tauri backend inside the desktop app, or the offline localStorage
 * stand-in in a plain browser.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return connectionManager.primary().transport.invoke<T>(cmd, args);
}

/**
 * Subscribe to a backend event on the primary connection. In browser-only mode
 * the offline transport returns a no-op unlisten.
 */
export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
  return connectionManager.primary().transport.listen<T>(event, handler);
}

export type { UnlistenFn };
