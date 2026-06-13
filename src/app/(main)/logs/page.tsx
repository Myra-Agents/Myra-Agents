"use client";

import { useCallback, useMemo, useState } from "react";

import { ChevronLeftIcon, ExternalLinkIcon, FileIcon, FolderIcon, ScrollTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConversationView } from "@/components/conversation/conversation-view";
import { ReviewComposer } from "@/components/conversation/review-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKanban } from "@/hooks/use-kanban";
import { parseGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { parseTranscript } from "@/lib/conversation/parse";
import { invokeOn } from "@/lib/tauri";
import type { AgentRun, KanbanCard } from "@/types/kanban";

interface RunArtifact {
  name: string;
  path: string;
  size: number;
  modified?: string;
}

export default function LogsPage() {
  const t = useTranslations("logs");
  const { cards, loading, moveCard, addRevisionNote, answerFeedback } = useKanban();
  const [selectedRun, setSelectedRun] = useState<{ card: KanbanCard; run: AgentRun } | null>(null);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([]);

  const transcript = useMemo(
    () => (selectedRun ? parseTranscript(logContent, selectedRun.run) : { entries: [], structured: false }),
    [logContent, selectedRun],
  );

  const allRuns = cards
    .filter((c) => c.runHistory && c.runHistory.length > 0)
    .flatMap((c) => (c.runHistory ?? []).map((run) => ({ card: c, run })))
    .sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt));

  const handleViewLog = useCallback(
    async (card: KanbanCard, run: AgentRun) => {
      setSelectedRun({ card, run });
      setLoadingLog(true);
      setArtifacts([]);
      const { connId, entityId } = parseGlobalId(card.id);
      try {
        const log = await invokeOn<string>(connId, "get_run_log", { cardId: entityId, runId: run.id });
        setLogContent(log);
      } catch (e) {
        setLogContent(t("details.errorLoading", { error: String(e) }));
      } finally {
        setLoadingLog(false);
      }
      try {
        const list = await invokeOn<RunArtifact[]>(connId, "list_run_artifacts", { cardId: entityId });
        setArtifacts(list);
      } catch {
        setArtifacts([]);
      }
    },
    [t],
  );

  const openPath = useCallback(
    async (path: string) => {
      // Artifact paths live on the run's owning server — route open there.
      const connId = selectedRun ? parseGlobalId(selectedRun.card.id).connId : connectionManager.primaryId();
      try {
        await invokeOn(connId, "open_path", { path });
      } catch (e) {
        toast.error(String(e));
      }
    },
    [selectedRun],
  );

  const openWorkingDir = useCallback(async (cardId: string) => {
    const { connId, entityId } = parseGlobalId(cardId);
    try {
      await invokeOn(connId, "open_card_working_dir", { cardId: entityId });
    } catch (e) {
      toast.error(String(e));
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (selectedRun) {
    // The run's status is a snapshot; the card may still be waiting on the user.
    const liveCard = cards.find((c) => c.id === selectedRun.card.id) ?? selectedRun.card;
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedRun(null)}>
            <ChevronLeftIcon className="size-4" />
            {t("back")}
          </Button>
          <h2 className="truncate font-semibold text-sm">{selectedRun.card.title}</h2>
          <RunStatusBadge status={selectedRun.run.status} />
        </div>

        <div className="space-x-3 text-muted-foreground text-xs">
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
          {selectedRun.run.endedAt && (
            <span>
              {t("details.duration")}: {formatDuration(selectedRun.run.startedAt, selectedRun.run.endedAt)}
            </span>
          )}
          {typeof selectedRun.run.tokens === "number" && (
            <span>
              {t("details.tokens")}: {selectedRun.run.tokens.toLocaleString()}
            </span>
          )}
          {typeof selectedRun.run.cost === "number" && (
            <span>
              {t("details.cost")}: ${selectedRun.run.cost.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openWorkingDir(selectedRun.card.id)}>
            <FolderIcon className="size-3.5" />
            {t("details.openWorkingDir")}
          </Button>
          {artifacts.length > 0 && <span className="text-muted-foreground text-xs">{t("details.artifacts")}:</span>}
          {artifacts.map((artifact) => (
            <Button
              key={artifact.path}
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 font-mono text-xs"
              onClick={() => openPath(artifact.path)}
              title={artifact.path}
            >
              <FileIcon className="size-3" />
              {artifact.name}
              <ExternalLinkIcon className="size-3 opacity-60" />
            </Button>
          ))}
        </div>

        <Tabs defaultValue="conversation" className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList>
            <TabsTrigger value="conversation">{t("conversation.tab")}</TabsTrigger>
            <TabsTrigger value="raw">{t("conversation.rawTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="conversation" className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              {loadingLog ? (
                <p className="text-muted-foreground text-sm">{t("details.loadingLog")}</p>
              ) : (
                <ConversationView transcript={transcript} />
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw" className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              {selectedRun.run.prompt && (
                <Card className="mb-3">
                  <CardContent className="p-3">
                    <p className="mb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                      {t("details.prompt")}
                    </p>
                    <pre className="whitespace-pre-wrap text-foreground text-xs">{selectedRun.run.prompt}</pre>
                  </CardContent>
                </Card>
              )}
              <div
                data-ph-no-capture
                className="min-h-[200px] whitespace-pre-wrap rounded-md bg-foreground/95 p-4 font-mono text-background text-xs leading-relaxed"
              >
                {loadingLog ? t("details.loadingLog") : logContent || t("details.noOutput")}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <ReviewComposer
          status={liveCard.status}
          question={liveCard.agentQuestion}
          onApprove={async () => {
            await moveCard(liveCard.id, "done");
          }}
          onRevise={async (note) => {
            await addRevisionNote(liveCard.id, note);
          }}
          onAnswer={async (answer) => {
            await answerFeedback(liveCard.id, answer);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <ScrollTextIcon className="size-5 text-muted-foreground" />
        <h1 className="font-semibold text-xl tracking-tight">{t("title")}</h1>
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
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => handleViewLog(card, run)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <RunStatusBadge status={run.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{card.title}</p>
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
