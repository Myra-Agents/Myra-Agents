"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { formatHm } from "@myra/shared/types/schedule";
import {
  ActivityIcon,
  AlarmClockIcon,
  BarChart3Icon,
  CircleAlertIcon,
  CloudIcon,
  CloudOffIcon,
  LoaderIcon,
  PlusIcon,
  ServerIcon,
  ServerOffIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useHubStatus } from "@/hooks/use-hub-status";
import { useKanban } from "@/hooks/use-kanban";
import { useLocalServer } from "@/hooks/use-local-server";
import { useSchedules } from "@/hooks/use-schedules";
import { useShortcutStore } from "@/stores/shortcut-store";
import type { AgentRun, KanbanCard } from "@/types/kanban";

/** Re-render cadence for the live "elapsed" counters on running cards. */
const TICK_MS = 30_000;

export default function HomePage() {
  const t = useTranslations("home");
  const router = useRouter();
  const requestNewCard = useShortcutStore((s) => s.requestNewCard);
  const { cards, loading } = useKanban();
  const { todayTriggers } = useSchedules();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const attention = useMemo(
    () => cards.filter((c) => c.status === "waiting_feedback" || c.status === "awaiting_review"),
    [cards],
  );
  const running = useMemo(() => cards.filter((c) => c.status === "in_progress" || c.agentQueued), [cards]);
  const recentRuns = useMemo(
    () =>
      cards
        .flatMap((c) => (c.runHistory ?? []).map((run) => ({ card: c, run })))
        .filter(({ run }) => run.status !== "running")
        .sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt))
        .slice(0, 5),
    [cards],
  );
  const upcoming = todayTriggers().slice(0, 5);

  const handleNewCard = () => {
    router.push("/kanban");
    requestNewCard();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  const boardEmpty = cards.filter((c) => c.status !== "trashed").length === 0;

  return (
    <div className="flex flex-col gap-6 p-4 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex items-center gap-3">
          <HealthChips />
          <Button size="sm" onClick={handleNewCard}>
            <PlusIcon className="size-4" />
            {t("newTask")}
          </Button>
        </div>
      </div>

      {boardEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm font-medium">{t("empty.title")}</p>
            <p className="text-muted-foreground text-sm max-w-sm">{t("empty.body")}</p>
            <Button size="sm" className="mt-2" onClick={handleNewCard}>
              <PlusIcon className="size-4" />
              {t("empty.cta")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Section icon={CircleAlertIcon} title={t("attention.title")} count={attention.length}>
            {attention.length === 0 ? (
              <SectionEmpty label={t("attention.empty")} />
            ) : (
              attention.map((card) => (
                <CardRow key={card.id} card={card} onClick={() => router.push("/kanban")}>
                  <Badge variant={card.status === "waiting_feedback" ? "secondary" : "outline"} className="text-[10px]">
                    {card.status === "waiting_feedback" ? t("attention.question") : t("attention.review")}
                  </Badge>
                  {card.agentQuestion && (
                    <p className="text-[11px] text-muted-foreground truncate max-w-48">{card.agentQuestion}</p>
                  )}
                </CardRow>
              ))
            )}
          </Section>

          <Section icon={LoaderIcon} title={t("running.title")} count={running.length}>
            {running.length === 0 ? (
              <SectionEmpty label={t("running.empty")} />
            ) : (
              running.map((card) => (
                <CardRow key={card.id} card={card} onClick={() => router.push("/kanban")}>
                  {card.agentQueued ? (
                    <Badge variant="outline" className="text-[10px]">
                      {t("running.queued")}
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px]">
                      {t("running.running")}
                    </Badge>
                  )}
                  {card.agentRunStartedAt && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatElapsed(card.agentRunStartedAt, now)}
                    </span>
                  )}
                </CardRow>
              ))
            )}
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              icon={AlarmClockIcon}
              title={t("upcoming.title")}
              count={upcoming.length}
              viewAll={{ label: t("viewAll"), href: "/schedules" }}
            >
              {upcoming.length === 0 ? (
                <SectionEmpty label={t("upcoming.empty")} />
              ) : (
                upcoming.map((task) => (
                  <Card
                    key={task.id}
                    className="cursor-pointer rounded-lg py-0 hover:bg-muted/50 transition-colors"
                    onClick={() => router.push("/schedules")}
                  >
                    <CardContent className="flex items-center gap-3 px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {formatHm(task.nextRunAt)}
                      </span>
                      <p className="text-sm font-medium truncate">{task.name}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </Section>

            <Section
              icon={ActivityIcon}
              title={t("recent.title")}
              count={recentRuns.length}
              viewAll={{ label: t("viewAll"), href: "/logs" }}
            >
              {recentRuns.length === 0 ? (
                <SectionEmpty label={t("recent.empty")} />
              ) : (
                recentRuns.map(({ card, run }) => (
                  <Card
                    key={`${card.id}-${run.id}`}
                    className="cursor-pointer rounded-lg py-0 hover:bg-muted/50 transition-colors"
                    onClick={() => router.push("/logs")}
                  >
                    <CardContent className="flex items-center gap-3 px-3 py-2">
                      <RunStatusBadge status={run.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{card.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString()}
                          {run.endedAt && ` — ${formatDuration(run.startedAt, run.endedAt)}`}
                          {typeof run.cost === "number" && ` — $${run.cost.toFixed(2)}`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </Section>
          </div>

          <StatsSection cards={cards} />
        </>
      )}
    </div>
  );
}

/** Number of days charted; KPIs cover the last `KPI_DAYS` of that window. */
const CHART_DAYS = 14;
const KPI_DAYS = 7;

interface DayStat {
  label: string;
  completed: number;
  failed: number;
  cost: number;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildStats(cards: KanbanCard[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byKey = new Map<string, DayStat>();
  const daily: DayStat[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const stat: DayStat = {
      label: d.toLocaleDateString(undefined, { day: "numeric", month: "numeric" }),
      completed: 0,
      failed: 0,
      cost: 0,
    };
    byKey.set(localDayKey(d), stat);
    daily.push(stat);
  }

  const kpiCutoff = new Date(today);
  kpiCutoff.setDate(kpiCutoff.getDate() - (KPI_DAYS - 1));
  let runs = 0;
  let completed = 0;
  let cost = 0;
  let durationMs = 0;
  let durationCount = 0;

  for (const card of cards) {
    for (const run of card.runHistory ?? []) {
      if (run.status !== "completed" && run.status !== "failed") continue;
      const started = new Date(run.startedAt);
      const slot = byKey.get(localDayKey(started));
      if (slot) {
        if (run.status === "completed") slot.completed++;
        else slot.failed++;
        slot.cost += run.cost ?? 0;
      }
      if (started >= kpiCutoff) {
        runs++;
        if (run.status === "completed") completed++;
        cost += run.cost ?? 0;
        if (run.endedAt) {
          const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
          if (ms > 0) {
            durationMs += ms;
            durationCount++;
          }
        }
      }
    }
  }

  return {
    daily,
    kpis: {
      runs,
      successRate: runs > 0 ? completed / runs : null,
      cost,
      avgDurationMs: durationCount > 0 ? durationMs / durationCount : null,
    },
  };
}

function StatsSection({ cards }: { cards: KanbanCard[] }) {
  const t = useTranslations("home.stats");
  const { daily, kpis } = useMemo(() => buildStats(cards), [cards]);

  // No finished run in the chart window → placeholder instead of flat charts.
  if (!daily.some((d) => d.completed + d.failed > 0)) {
    return (
      <Section icon={BarChart3Icon} title={t("title")} count={0}>
        <SectionEmpty label={t("empty", { days: CHART_DAYS })} />
      </Section>
    );
  }

  const runsConfig = {
    completed: { label: t("completed"), color: "var(--chart-1)" },
    failed: { label: t("failed"), color: "var(--destructive)" },
  } satisfies ChartConfig;
  const costConfig = {
    cost: { label: t("cost"), color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <Section icon={BarChart3Icon} title={t("title")} count={0}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiTile label={t("runs", { days: KPI_DAYS })} value={String(kpis.runs)} />
        <KpiTile
          label={t("successRate", { days: KPI_DAYS })}
          value={kpis.successRate === null ? "—" : `${Math.round(kpis.successRate * 100)}%`}
        />
        <KpiTile label={t("cost", { days: KPI_DAYS })} value={`$${kpis.cost.toFixed(2)}`} />
        <KpiTile
          label={t("avgDuration", { days: KPI_DAYS })}
          value={kpis.avgDurationMs === null ? "—" : formatMs(kpis.avgDurationMs)}
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <Card className="rounded-lg py-0">
          <CardContent className="px-3 py-2">
            <p className="text-[11px] text-muted-foreground mb-1">{t("runsPerDay", { days: CHART_DAYS })}</p>
            <ChartContainer config={runsConfig} className="h-[120px] w-full">
              <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="completed" stackId="runs" fill="var(--color-completed)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="failed" stackId="runs" fill="var(--color-failed)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="rounded-lg py-0">
          <CardContent className="px-3 py-2">
            <p className="text-[11px] text-muted-foreground mb-1">{t("costPerDay", { days: CHART_DAYS })}</p>
            <ChartContainer config={costConfig} className="h-[120px] w-full">
              <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="cost"
                  type="monotone"
                  stroke="var(--color-cost)"
                  fill="var(--color-cost)"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-lg py-0">
      <CardContent className="px-3 py-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function formatMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function Section({
  icon: Icon,
  title,
  count,
  viewAll,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  viewAll?: { label: string; href: string };
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <section className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count > 0 && (
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {count}
          </Badge>
        )}
        {viewAll && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 text-xs text-muted-foreground"
            onClick={() => router.push(viewAll.href)}
          >
            {viewAll.label}
          </Button>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function SectionEmpty({ label }: { label: string }) {
  return (
    <Card className="rounded-lg py-0">
      <CardContent className="px-3 py-2">
        <p className="text-muted-foreground text-xs text-center">{label}</p>
      </CardContent>
    </Card>
  );
}

function CardRow({ card, onClick, children }: { card: KanbanCard; onClick: () => void; children: React.ReactNode }) {
  return (
    <Card className="cursor-pointer rounded-lg py-0 hover:bg-muted/50 transition-colors" onClick={onClick}>
      <CardContent className="flex items-center gap-3 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{card.title}</p>
        </div>
        <div className="flex items-center gap-2 min-w-0">{children}</div>
      </CardContent>
    </Card>
  );
}

function RunStatusBadge({ status }: { status: AgentRun["status"] }) {
  const t = useTranslations("logs.status");
  const variants: Record<
    AgentRun["status"],
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    running: { label: t("running"), variant: "default" },
    needs_feedback: { label: t("needsFeedback"), variant: "secondary" },
    awaiting_review: { label: t("awaitingReview"), variant: "outline" },
    completed: { label: t("completed"), variant: "default" },
    failed: { label: t("failed"), variant: "destructive" },
  };
  const v = variants[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={v.variant} className="text-[10px]">
      {v.label}
    </Badge>
  );
}

/** Compact local-server + hub health, top-right of the page header. */
function HealthChips() {
  const t = useTranslations("home.health");
  const { status } = useLocalServer();
  const { configured, availability, instanceCount } = useHubStatus();

  return (
    <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
      {status &&
        (status.running ? (
          <span className="flex items-center gap-1" title={t("serverRunning", { port: status.port })}>
            <ServerIcon className="size-3.5 text-emerald-500" />
            {t("server")}
          </span>
        ) : (
          <span className="flex items-center gap-1" title={t("serverStopped")}>
            <ServerOffIcon className="size-3.5 text-destructive" />
            {t("server")}
          </span>
        ))}
      {configured &&
        (availability === "online" ? (
          <span className="flex items-center gap-1" title={t("hubOnline", { count: instanceCount })}>
            <CloudIcon className="size-3.5 text-emerald-500" />
            {t("hub")}
          </span>
        ) : (
          <span
            className="flex items-center gap-1"
            title={availability === "checking" ? t("hubChecking") : t("hubOffline")}
          >
            <CloudOffIcon className="size-3.5 text-muted-foreground" />
            {t("hub")}
          </span>
        ))}
    </div>
  );
}

function formatElapsed(startedAt: string, now: number): string {
  const ms = now - Date.parse(startedAt);
  if (Number.isNaN(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
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
