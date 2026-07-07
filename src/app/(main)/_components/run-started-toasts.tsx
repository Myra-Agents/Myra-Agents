"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { claimRunToast } from "@/hooks/use-run-started-toast";
import { ensureBoardLive, onRunStarted } from "@/stores/board-store";

/**
 * Headless (renders nothing): toasts "Operation started" for EVERY run start
 * observed live — scheduler-fired patrols, queued runs finally dequeuing,
 * auto-resumes, board launches — with a "View operation" action that opens the
 * run's live view. Mounted once in the (main) layout, like the other headless
 * bootstraps.
 *
 * Run starts arrive via the board store's `agent-result-changed` push
 * ({@link onRunStarted}), which fires only for transitions observed after the
 * initial `get_cards` snapshot — so hydration and reconnects never toast.
 * Manual triggers already toast at the RPC response; {@link claimRunToast}
 * dedupes whichever side fires second.
 */
export function RunStartedToasts() {
  const router = useRouter();
  const t = useTranslations("runToast");

  useEffect(() => {
    // Keep the board store live so pushes arrive on every screen. Idempotent.
    ensureBoardLive();
    return onRunStarted((card) => {
      const runId = card.agentRunId;
      if (!runId || !claimRunToast(runId)) return; // manual trigger already toasted
      // Already watching this operation's live view (e.g. an auto-resume of the
      // open run) — a toast pointing at the current page would be noise.
      const here = window.location;
      if (here.pathname.startsWith("/logs") && here.search.includes(encodeURIComponent(card.id))) return;
      toast.success(t("started"), {
        action: {
          label: t("view"),
          onClick: () => router.push(`/logs?card=${encodeURIComponent(card.id)}`),
        },
      });
    });
  }, [router, t]);

  return null;
}
