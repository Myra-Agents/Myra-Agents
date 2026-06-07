import { invoke as coreInvoke, isTauri as tauriIsTauri } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { connectionManager } from "@/lib/connections/manager";

/**
 * Client seam. Public surface (`invoke`/`listen`/`isTauri`/`isDevModeError`)
 * routes through the ConnectionManager's primary connection. Phase 4 adds
 * `invokeOn` for routing a command at a specific connection (split out of a
 * card's GlobalId) — aggregation-aware hooks fan out / route / demux via the
 * manager directly.
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
  return e instanceof Error && e.message.includes("[Dev Mode]");
}

/**
 * Open a URL in the user's default browser. Inside the Tauri webview a plain
 * `<a target="_blank">` never reaches the OS browser, so route through the
 * opener plugin (capability `opener:allow-open-url`); in a plain browser fall
 * back to opening a new tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (tauriIsTauri()) {
    await coreInvoke("plugin:opener|open_url", { url });
    return;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Invoke a backend command on the primary connection. Resolves against the
 * in-process Tauri backend inside the desktop app, or the offline localStorage
 * stand-in in a plain browser.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return connectionManager.primary().transport.invoke<T>(cmd, args);
}

/** Invoke a backend command on a specific connection (routed by GlobalId). */
export async function invokeOn<T>(connId: string, cmd: string, args?: Record<string, unknown>): Promise<T> {
  return connectionManager.invokeOne<T>(connId, cmd, args);
}

/**
 * Subscribe to a backend event on the primary connection. In browser-only mode
 * the offline transport returns a no-op unlisten.
 */
export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
  return connectionManager.primary().transport.listen<T>(event, handler);
}

export type { UnlistenFn };
