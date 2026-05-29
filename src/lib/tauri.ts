import { invoke as tauriInvoke, isTauri as tauriIsTauri } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";

import { browserInvoke } from "@/lib/browser-backend";

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
 * Safe wrapper around Tauri's invoke(). Returns the result when inside
 * the Tauri webview, or throws a user-friendly error in browser-only mode.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    return browserInvoke<T>(cmd, args);
  }
  return tauriInvoke<T>(cmd, args);
}

/**
 * Safe wrapper around Tauri's listen(). Returns a no-op unlisten in browser-only mode.
 */
export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined;
  }
  return tauriListen<T>(event, handler);
}

export type { UnlistenFn };
