"use client";

import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";

/** Mounts the app-wide keyboard shortcut listener. Renders nothing. */
export function GlobalShortcuts() {
  useGlobalShortcuts();
  return null;
}
