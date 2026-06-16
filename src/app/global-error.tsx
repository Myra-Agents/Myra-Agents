"use client";

import { useEffect } from "react";

import posthog from "posthog-js";

/**
 * Root error boundary — catches crashes in the root layout itself (where the
 * normal `error.tsx` can't render). Reports to PostHog Error Tracking, then
 * shows a minimal, dependency-free fallback (the i18n/theme providers may be
 * the thing that failed, so this renders its own <html>/<body>).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (posthog.__loaded) posthog.captureException(error, { boundary: "global", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, marginTop: "0.5rem" }}>The error has been reported. Try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: "1rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
