"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname } from "next/navigation";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

// Set NEXT_PUBLIC_POSTHOG_KEY at build time (release CI + local .env.local).
// Without it, the provider initializes nothing and just renders children.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let started = false;

/** Initialize PostHog once on the client. No-op when no key is configured. */
function ensureInit() {
  if (started || !KEY || typeof window === "undefined") return;
  started = true;
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // static export has no server nav — we send it manually below
    capture_pageleave: true,
    persistence: "localStorage", // Tauri webview: avoid cross-origin cookie quirks
  });
}

/**
 * Wraps the app with PostHog. Safe to mount unconditionally: without
 * `NEXT_PUBLIC_POSTHOG_KEY` it initializes nothing and just renders children.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    ensureInit();
  }, []);

  useEffect(() => {
    if (started) posthog.capture("$pageview", { $current_url: pathname });
  }, [pathname]);

  if (!KEY) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
