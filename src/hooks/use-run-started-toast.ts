"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ensureBoardLive, useBoardStore } from "@/stores/board-store";

/**
 * Run ids that already produced an "Operation started" toast. Two paths can
 * race to toast the same run — the manual trigger (RPC response, below) and
 * the global run-started listener (`RunStartedToasts`, fed by the
 * `agent-result-changed` push, which can land *before* the RPC resolves).
 * Whichever claims the run id first shows the single toast.
 */
const claimedRunIds = new Set<string>();

/** Atomically claim the right to toast for a run. True = caller toasts. */
export function claimRunToast(runId: string): boolean {
  if (claimedRunIds.has(runId)) return false;
  claimedRunIds.add(runId);
  return true;
}

/**
 * Success toast shown after a run is started manually ("Run now" on a patrol,
 * re-run from history, …) with a "View operation" action that deep-links to
 * the created operation's live view (`/logs?card=…`).
 *
 * Kept per-trigger (instead of relying solely on the global listener) so the
 * click always gets immediate feedback even if the event pipeline lags; the
 * {@link claimRunToast} set prevents the listener from double-toasting.
 *
 * The server RPC returns the *run* id while navigation is keyed by *card* id,
 * so the card is resolved at click time from the board store — whose
 * `agent-result-changed` push delivers the freshly spawned card (with its
 * `agentRunId`) within moments of the trigger. If the card hasn't landed yet,
 * the action falls back to the Operations list.
 */
export function useRunStartedToast() {
  const router = useRouter();
  const t = useTranslations("runToast");

  return useCallback(
    (runId: string, message?: string) => {
      if (!claimRunToast(runId)) return; // global listener beat us to it
      // Make sure the board store is live even off the board screens, so the
      // new card (carrying agentRunId) is pushed into the store. Idempotent.
      ensureBoardLive();
      toast.success(message ?? t("started"), {
        action: {
          label: t("view"),
          onClick: () => {
            const card = useBoardStore.getState().cards.find((c) => c.agentRunId === runId);
            router.push(card ? `/logs?card=${encodeURIComponent(card.id)}` : "/runs");
          },
        },
      });
    },
    [router, t],
  );
}
