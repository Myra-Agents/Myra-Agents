"use client";

// Inline reply box shown at the bottom of a run's conversation when it's
// waiting on the user — mirroring how you'd answer Claude. Two modes:
//   awaiting_review  → approve, or send a revision note for rework
//   waiting_feedback → answer the agent's question (relaunches the run)
// Wraps the same actions the Kanban review/feedback modals use.

import { useState } from "react";

import { CheckCircle2Icon, CheckIcon, RotateCcwIcon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { KanbanStatus } from "@/types/kanban";

interface Props {
  status: KanbanStatus;
  question?: string;
  onApprove: () => Promise<void>;
  onRevise: (note: string) => Promise<void>;
  onAnswer: (answer: string) => Promise<void>;
  onReopen: () => Promise<void>;
}

export function ReviewComposer({ status, question, onApprove, onRevise, onAnswer, onReopen }: Props) {
  const t = useTranslations("logs.conversation.review");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setText("");
    } finally {
      setBusy(false);
    }
  };

  // Approved/done run: keep a permanent way to reverse the decision.
  if (status === "done") {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 border-t pt-3">
        <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400" />
        <span className="text-muted-foreground text-sm">{t("approvedState")}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={() => run(onReopen)}
        >
          <RotateCcwIcon className="size-4" />
          {t("reopen")}
        </Button>
      </div>
    );
  }

  if (status !== "awaiting_review" && status !== "waiting_feedback") return null;
  const isReview = status === "awaiting_review";

  return (
    <div className="mx-auto w-full max-w-3xl border-t pt-3">
      {isReview ? (
        <p className="mb-1.5 font-medium text-muted-foreground text-xs">{t("awaitingTitle")}</p>
      ) : (
        <>
          <p className="mb-1.5 font-medium text-muted-foreground text-xs">{t("questionTitle")}</p>
          {question && <p className="mb-2 text-foreground text-sm italic">&ldquo;{question}&rdquo;</p>}
        </>
      )}

      <Textarea
        data-ph-no-capture
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isReview ? t("revisePlaceholder") : t("answerPlaceholder")}
        rows={3}
        disabled={busy}
      />

      <div className="mt-2 flex justify-end gap-2">
        {isReview ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || !text.trim()}
              onClick={() => run(() => onRevise(text.trim()))}
            >
              {t("requestChanges")}
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => run(onApprove)}>
              <CheckIcon className="size-4" />
              {t("approve")}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={busy || !text.trim()}
            onClick={() => run(() => onAnswer(text.trim()))}
          >
            <SendIcon className="size-4" />
            {busy ? t("sending") : t("send")}
          </Button>
        )}
      </div>
    </div>
  );
}
