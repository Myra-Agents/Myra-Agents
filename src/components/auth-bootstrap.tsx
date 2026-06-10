"use client";

import { useEffect } from "react";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { hasClerkSession, isClerkConfigured } from "@/lib/auth/clerk";
import { exchange, isAuthConfigured, isAuthenticated, setFromDesktopClaim } from "@/lib/auth/session";

/**
 * Headless auth glue, mounted once in the app shell.
 *
 *  - **Web:** after Clerk's hosted sign-in redirects back, a live Clerk session
 *    exists but no hub session yet — exchange it for hub tokens.
 *  - **Desktop:** listen for the `auth-callback` event the Rust deep-link
 *    handler emits when `myra://auth/callback?code=…` arrives, and claim the
 *    one-time code for hub tokens.
 */
export function AuthBootstrap() {
  useEffect(() => {
    if (!isAuthConfigured()) return;

    if (isTauri()) {
      // The Rust side may have buffered a callback that arrived before listeners
      // were ready; drain it, then keep listening.
      const claim = (code: string) => {
        if (code) void setFromDesktopClaim(code).catch((e) => console.error("[auth] desktop claim failed:", e));
      };
      invoke<string | null>("take_pending_auth_code")
        .then((code) => code && claim(code))
        .catch(() => undefined);
      const un = listen<{ code: string }>("auth-callback", (e) => claim(e.payload.code));
      return () => {
        void un.then((f) => f());
      };
    }

    // Web: exchange a fresh Clerk session for hub tokens once.
    if (!isClerkConfigured() || isAuthenticated()) return;
    void (async () => {
      if (await hasClerkSession()) {
        await exchange().catch((err) => console.error("[auth] exchange failed:", err));
      }
    })();
  }, []);

  return null;
}
