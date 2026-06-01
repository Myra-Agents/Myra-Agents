import { browserInvoke } from "@/lib/browser-backend";

import type { Transport, UnlistenFn } from "./types";

/**
 * Offline transport — localStorage-backed domain logic, no live events.
 * The zero-server fallback used by plain `next dev` (and any client with no
 * real connection configured). Agent/process commands throw the `[Dev Mode]`
 * sentinel from `browserInvoke`.
 */
export const browserTransport: Transport = {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return browserInvoke<T>(cmd, args);
  },
  async listen<_T>(): Promise<UnlistenFn> {
    return () => undefined;
  },
};
