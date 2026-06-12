"use client";

import { useEffect } from "react";

import posthog from "posthog-js";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for the main app. The root layout (and its
 * providers) stay mounted — only the failed route subtree is replaced. Reports
 * to PostHog Error Tracking and offers a retry.
 */
export default function MainError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (posthog.__loaded) posthog.captureException(error, { boundary: "main", digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This view hit an error. It's been reported — you can retry without losing the rest of the app.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
