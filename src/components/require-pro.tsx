"use client";

import type { ReactNode } from "react";

/**
 * No paid tiers for now — the app (board, local agents) is fully usable without
 * an account. Signing in is what unlocks the FREE hosted agents (the hub's LLM
 * proxy feeds the built-in harness), surfaced contextually where agents run,
 * not as a wall here. Kept as a seam so a future tier gate has one place to go.
 */
export function RequirePro({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
