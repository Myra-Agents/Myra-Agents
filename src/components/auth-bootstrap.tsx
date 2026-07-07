"use client";

import { useEffect, useRef } from "react";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { useAuth } from "@/hooks/use-auth";
import { type RemoteStatus, useRemoteAccess } from "@/hooks/use-remote-access";
import { hasClerkSession, isClerkConfigured } from "@/lib/auth/clerk";
import { exchange, isAuthConfigured, isAuthenticated, setFromDesktopClaim } from "@/lib/auth/session";
import { connectionManager } from "@/lib/connections/manager";

/**
 * Headless auth glue, mounted once in the app shell.
 *
 *  - **Web:** after Clerk's hosted sign-in redirects back, a live Clerk session
 *    exists but no hub session yet — exchange it for hub tokens.
 *  - **Desktop:** listen for the `auth-callback` event the Rust deep-link
 *    handler emits when `myra://auth/callback?code=…` arrives, and claim the
 *    one-time code for hub tokens.
 *  - **Desktop, signed in:** auto-enroll the local server against the managed
 *    cloud hub. Signing in is what unlocks the FREE hosted agents — the
 *    instance credential written by enrollment is what the embedded harness
 *    authenticates to the hub's LLM proxy with — so the account must be usable
 *    the moment login completes, with no extra setup step.
 */
export function AuthBootstrap() {
  const { isAuthenticated: authed } = useAuth();
  const { status, loading, enable } = useRemoteAccess();
  // One attempt per app session: a failed enroll logs and leaves the manual
  // Settings → Hub path; it must never loop.
  const attempted = useRef(false);

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

  // Desktop auto-enroll: signed in + local server not yet enrolled → pair
  // against the cloud hub and enroll silently.
  useEffect(() => {
    if (!isTauri() || !authed || loading || attempted.current) return;
    if (!needsEnroll(status)) return;
    const cloud = connectionManager.listHubs().find((h) => h.id === "cloud");
    if (!cloud) return; // cloud hub not registered (yet) — retry on next status/auth change
    attempted.current = true;
    void (async () => {
      try {
        const { code } = await connectionManager.pairHub(cloud.id);
        await enable(cloud.baseUrl, code, "desktop");
        console.info("[auth] local server enrolled — free hosted agents ready");
      } catch (e) {
        console.error("[auth] auto-enroll failed (Settings → Hub to retry):", e);
      }
    })();
  }, [authed, loading, status, enable]);

  return null;
}

function needsEnroll(status: RemoteStatus | null): boolean {
  return status !== null && !status.enrolled;
}
