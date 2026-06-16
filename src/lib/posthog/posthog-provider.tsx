"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname } from "next/navigation";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

import { appContext, PH_ENV, PH_HOST, PH_KEY } from "./config";

let started = false;

/** Initialize PostHog once on the client. No-op when no key is configured. */
function ensureInit() {
  if (started || !PH_KEY || typeof window === "undefined") return;
  started = true;
  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    capture_pageview: false, // static export has no server nav — sent manually below
    capture_pageleave: true,
    persistence: "localStorage", // Tauri webview: avoid cross-origin cookie quirks
    person_profiles: "identified_only",
    autocapture: true,
    capture_exceptions: true, // Error Tracking: autocapture unhandled errors + rejections
    enable_recording_console_log: true, // record console.*/logs into the replay timeline
    // Session replay. This app shows user prompts, code, and agent logs — all
    // potentially sensitive — so mask aggressively by default. Add
    // `data-ph-no-capture` (block) or `ph-mask` class to redact specific nodes.
    // Replay also has to be enabled in the PostHog project settings to record.
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
      maskInputOptions: { password: true, email: true, text: false },
    },
  });
  // Stamp dev/prod + surface + os onto every event and every replay.
  posthog.register(appContext());
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
    if (started) posthog.capture("$pageview", { $current_url: pathname, environment: PH_ENV });
  }, [pathname]);

  if (!PH_KEY) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
