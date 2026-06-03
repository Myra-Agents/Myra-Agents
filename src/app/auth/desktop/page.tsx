"use client";

import { useEffect, useState } from "react";

import { hasClerkSession, isClerkConfigured, signInWithClerk } from "@/lib/auth/clerk";
import { requestDesktopHandoff } from "@/lib/auth/session";

/**
 * Desktop login **bridge page**, opened in the system browser by the Tauri
 * `start_login` command. The Tauri webview can't host Clerk's redirect/cookies,
 * so this runs the normal web Clerk sign-in here, mints a one-time handoff code
 * at the hub, then deep-links `myra://auth/callback?code=…` back into the app
 * (which claims it for hub tokens). Standalone — outside the (main) app shell.
 */
type Phase = "loading" | "signing-in" | "handing-off" | "done" | "error";

export default function DesktopAuthBridge() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    void (async () => {
      if (!isClerkConfigured()) {
        setError("Authentication is not configured.");
        setPhase("error");
        return;
      }
      try {
        if (!(await hasClerkSession())) {
          setPhase("signing-in");
          // Redirect to Clerk; on return we land back here with a live session.
          await signInWithClerk(window.location.href);
          return;
        }
        setPhase("handing-off");
        const code = await requestDesktopHandoff();
        setPhase("done");
        window.location.href = `myra://auth/callback?code=${encodeURIComponent(code)}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
  }, []);

  const message =
    phase === "error"
      ? error
      : phase === "done"
        ? "Signed in — return to Myra Agents. You can close this tab."
        : phase === "handing-off"
          ? "Finishing sign-in…"
          : "Signing you in…";

  return (
    <main style={{ display: "flex", minHeight: "100svh", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Myra Agents</h1>
        <p style={{ color: phase === "error" ? "#dc2626" : "#666", fontSize: 14 }}>{message}</p>
      </div>
    </main>
  );
}
