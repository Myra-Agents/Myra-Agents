"use client";

import { type ReactNode, useEffect, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";

import { UpsellScreen } from "@/components/upsell-screen";
import { useEntitlement } from "@/hooks/use-entitlement";

/**
 * Top-level web Pro gate. The desktop app is always allowed (free desktop users
 * keep the local-only board). On the web, free users get the {@link UpsellScreen}
 * instead of the board; Pro users (a logged-in hub session) get it normally.
 *
 * Both `isTauri()` and entitlement (read from localStorage) are only knowable on
 * the client, so the first client render must match the server output (children)
 * to avoid a hydration mismatch — the real gate kicks in after mount.
 */
export function RequirePro({ children }: { children: ReactNode }) {
  const { isPro } = useEntitlement();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && !isTauri() && !isPro) return <UpsellScreen />;
  return <>{children}</>;
}
