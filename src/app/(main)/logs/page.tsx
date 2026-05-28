"use client";

import { useCallback, useState } from "react";

import { ChevronLeftIcon, ScrollTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKanban } from "@/hooks/use-kanban";
import { invoke } from "@/lib/tauri";
import type { AgentRun, KanbanCard } from "@/types/kanban";

export default function LogsPage() {
  const t = useTranslations("logs");
  const { cards, loading } = useKanban();
  const [selectedRun, setSelectedRun] = useState<{ card: KanbanCard; run: AgentRun } | null>(null);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  const allRuns = cards
    .filter((c) => c.runHistory && c.runHistory.length > 0)
    .flatMap((c) => (c.runHistory ?? []).map((run) => ({ card: c, run })))
    .sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt));

  const handleViewLog = useCallback(
    async (card: KanbanCard, run: AgentRun) => {
      setSelectedRun({ card, run });
      setLoadingLog(true);
      try {
        const log = await invoke<string>("get_run_log", { cardId: card.id, runId: run.id });
        setLogContent(log);
      } catch (e) {
        setLogContent(t("details.errorLoading", { error: String(e) }));
      } finally {
        setLoadingLog(false);
      }
    },
    [t],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (selectedRun) {
    return (
      <div className="flex flex-col gap-4 p-4 h-full max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedRun(null)}>
            <ChevronLeftIcon className="size-4" />
            {t("back")}
          </Button>
          <h2 className="text-sm font-semibold truncate">{selectedRun.card.title}</h2>
          <RunStatusBadge status={selectedRun.run.status} />
        </div>

        <div className="text-xs text-muted-foreground space-x-3">
          <span>
            {t("details.startedAt")}: {new Date(selectedRun.run.startedAt).toLocaleString()}
          </span>
          {selectedRun.run.endedAt && (
            <span>
              {t("details.endedAt")}: {new Date(selectedRun.run.endedAt).toLocaleString()}
            </span>
          )}
          {typeof selectedRun.run.exitCode === "number" && (
            <span>
              {t("details.exitCode")}: {selectedRun.run.exitCode}
            </span>
          )}
        </div>

        {selectedRun.run.prompt && (
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {t("details.prompt")}
              </p>
              <pre className="text-xs whitespace-pre-wrap text-foreground">{selectedRun.run.prompt}</pre>
            </CardContent>
          </Card>
        )}

        <ScrollArea className="flex-1 min-h-0">
          <div className="bg-foreground/95 text-background font-mono text-xs leading-relaxed p-4 rounded-md min-h-[200px]">
            {loadingLog ? t("details.loadingLog") : logContent || t("details.noOutput")}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <ScrollTextIcon className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      </div>

      {allRuns.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">{t("noLogs")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {allRuns.map(({ card, run }) => (
            <Card
              key={`${card.id}-${run.id}`}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleViewLog(card, run)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <RunStatusBadge status={run.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{card.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(run.startedAt).toLocaleString()}
                    {run.endedAt && ` — ${formatDuration(run.startedAt, run.endedAt)}`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RunStatusBadge({ status }: { status: AgentRun["status"] }) {
  const t = useTranslations("logs");
  const variants: Record<
    AgentRun["status"],
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    running: { label: t("status.running"), variant: "default" },
    needs_feedback: { label: t("status.needsFeedback"), variant: "secondary" },
    awaiting_review: { label: t("status.awaitingReview"), variant: "outline" },
    completed: { label: t("status.completed"), variant: "default" },
    failed: { label: t("status.failed"), variant: "destructive" },
  };
  const v = variants[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={v.variant} className="text-[10px]">
      {v.label}
    </Badge>
  );
}

function formatDuration(start: string, end: string): string {
  const ms = Date.parse(end) - Date.parse(start);
  if (Number.isNaN(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
