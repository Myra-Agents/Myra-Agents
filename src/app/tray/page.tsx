"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AlertCircleIcon,
  AppWindowIcon,
  LoaderIcon,
  PlusIcon,
  PowerIcon,
  SettingsIcon,
} from "lucide-react";

import { useConnections } from "@/hooks/use-connections";
import { useKanban } from "@/hooks/use-kanban";
import { buildStats, formatMs, KPI_DAYS } from "@/lib/home/overview-stats";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";

/** Re-render cadence for the live "elapsed" counters on running cards. */
const TICK_MS = 30_000;

/** Fire a Tauri command, swallowing the "not in Tauri" error in browser dev. */
async function cmd(name: string, args?: Record<string, unknown>): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke(name, args);
  } catch (e) {
    console.error(`[tray] ${name} failed:`, e);
  }
}

export default function TrayPopover() {
  const { cards } = useKanban();
  const { connections } = useConnections();
  const rootRef = useRef<HTMLDivElement>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // The status dot derives from the connection registry, which differs between
  // the static prerender (no localStorage) and the live client — gate it behind
  // mount so the first client render matches the server HTML (no hydration warning).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Make the window background transparent so the card's rounded corners show
  // the desktop behind them, not an opaque square (the shared root layout sets
  // an opaque body background for the main app).
  useEffect(() => {
    const html = document.documentElement.style.background;
    const body = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = html;
      document.body.style.background = body;
    };
  }, []);

  // Size the native window to the panel's content height, so it never shows a
  // big empty void below the actions. Re-runs whenever the content reflows.
  useLayoutEffect(() => {
    if (!isTauri()) return;
    const el = rootRef.current;
    if (!el) return;
    const win = getCurrentWebviewWindow();
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) void win.setSize(new LogicalSize(360, h));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const attention = useMemo(
    () => cards.filter((c) => c.status === "waiting_feedback" || c.status === "awaiting_review"),
    [cards],
  );
  const running = useMemo(() => cards.filter((c) => c.status === "in_progress" || c.agentQueued), [cards]);
  const { daily, kpis } = useMemo(() => buildStats(cards), [cards]);
  const hasStats = daily.some((d) => d.completed + d.failed > 0);
  const online = mounted && connections.some((c) => c.status === "connected");

  const openMain = (path: string, newTask = false) => cmd("open_main", { path, newTask });

  // Keyboard parity with the app: ⌘N new task, ⌘O open, Esc dismiss. Calls the
  // module-level `cmd` directly so the listener has no render-scoped deps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void cmd("hide_tray_popover");
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void cmd("open_main", { path: "/kanban", newTask: true });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void cmd("open_main", { path: "/", newTask: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={rootRef}
      className="bg-popover text-popover-foreground border-border flex w-screen flex-col overflow-hidden rounded-[18px] border text-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn("size-2.5 rounded-full", online ? "bg-emerald-500" : "bg-amber-500")}
            title={online ? "Connected" : "Connecting…"}
          />
          <span className="font-medium">Myra Agents</span>
        </div>
        <span className="text-muted-foreground text-xs">{running.length} running</span>
      </div>

      {/* Needs attention */}
      {attention.length > 0 && (
        <button
          type="button"
          onClick={() => openMain("/kanban")}
          className="mx-3 mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-left transition-colors hover:bg-amber-500/15"
        >
          <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertCircleIcon className="size-4 shrink-0" />
            <span className="text-[13px]">
              {attention.length} need{attention.length === 1 ? "s" : ""} your attention
            </span>
          </span>
          <span className="max-w-32 truncate text-xs font-medium text-amber-600 dark:text-amber-400">
            {attention[0]?.title} ›
          </span>
        </button>
      )}

      {/* Running agents */}
      <div className="max-h-64 overflow-y-auto px-2 pb-1">
        <div className="text-muted-foreground px-2 pb-1 text-xs">Agents</div>
        {running.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">No agent running.</p>
        ) : (
          running.map((card) => (
            <button
              type="button"
              key={card.id}
              onClick={() => openMain("/kanban")}
              className="hover:bg-accent flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors"
            >
              <LoaderIcon className="text-primary size-4 shrink-0 animate-spin [animation-duration:2s]" />
              <span className="flex-1 truncate">{card.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {card.agentQueued ? "queued" : formatElapsed(card.agentRunStartedAt, now)}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Stats (last KPI_DAYS) */}
      {hasStats && (
        <div className="border-border border-t px-4 py-3">
          <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
            <span>Last {KPI_DAYS} days</span>
            <button type="button" onClick={() => openMain("/")} className="hover:text-foreground transition-colors">
              View all ›
            </button>
          </div>
          <div className="flex gap-2">
            <Kpi label="Runs" value={String(kpis.runs)} />
            <Kpi
              label="Success"
              value={kpis.successRate === null ? "—" : `${Math.round(kpis.successRate * 100)}%`}
              accent="text-emerald-600 dark:text-emerald-400"
            />
            <Kpi label="Avg" value={kpis.avgDurationMs === null ? "—" : formatMs(kpis.avgDurationMs)} />
          </div>
          <Sparkbars daily={daily} />
        </div>
      )}

      {/* Primary actions */}
      <div className="border-border border-t p-2">
        <ActionRow icon={PlusIcon} label="New task" shortcut="⌘N" onClick={() => openMain("/kanban", true)} />
        <ActionRow icon={AppWindowIcon} label="Open Myra Agents" shortcut="⌘O" onClick={() => openMain("/")} />
      </div>

      {/* Footer */}
      <div className="border-border flex gap-1.5 border-t p-2">
        <FooterButton icon={SettingsIcon} label="Settings" onClick={() => openMain("/settings")} />
        <FooterButton icon={PowerIcon} label="Quit" onClick={() => void cmd("quit_app")} />
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-muted/60 flex-1 rounded-md px-2.5 py-1.5">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className={cn("text-lg font-medium tabular-nums", accent)}>{value}</div>
    </div>
  );
}

/** Compact 14-day completed/failed run bars — the home chart, popover-sized. */
function Sparkbars({ daily }: { daily: { label: string; completed: number; failed: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.completed + d.failed));
  return (
    <div className="mt-2.5 flex h-9 items-end gap-[3px]">
      {daily.map((d) => {
        const total = d.completed + d.failed;
        if (total === 0) {
          return <div key={d.label} className="bg-muted flex-1 rounded-[1px]" style={{ height: 3 }} />;
        }
        return (
          <div key={d.label} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }}>
            {d.completed > 0 && (
              <div
                className="rounded-t-[1px] bg-emerald-500"
                style={{ height: `${Math.round((d.completed / max) * 100)}%` }}
              />
            )}
            {d.failed > 0 && (
              <div className="bg-destructive" style={{ height: `${Math.round((d.failed / max) * 100)}%` }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition-colors"
    >
      <span className="flex items-center gap-2.5">
        <Icon className="size-4" />
        {label}
      </span>
      {shortcut && <span className="text-muted-foreground text-xs">{shortcut}</span>}
    </button>
  );
}

function FooterButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent text-muted-foreground hover:text-foreground flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function formatElapsed(startedAt: string | undefined, now: number): string {
  if (!startedAt) return "";
  const ms = now - Date.parse(startedAt);
  if (Number.isNaN(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
