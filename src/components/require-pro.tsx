"use client";

import type { ReactNode } from "react";

import { isTauri } from "@tauri-apps/api/core";

import { UpsellScreen } from "@/components/upsell-screen";
import { useEntitlement } from "@/hooks/use-entitlement";

/**
 * Top-level web Pro gate. The desktop app is always allowed (free desktop users
 * keep the local-only board). On the web, free users get the {@link UpsellScreen}
 * instead of the board; Pro users (a logged-in hub session) get it normally.
 */
export function RequirePro({ children }: { children: ReactNode }) {
  const { isPro } = useEntitlement();
  if (!isTauri() && !isPro) return <UpsellScreen />;
  return <>{children}</>;
}
