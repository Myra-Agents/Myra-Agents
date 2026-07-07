"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CopyPlusIcon,
  GitBranchIcon,
  GlobeIcon,
  LayoutTemplateIcon,
  ListFilterIcon,
  MailIcon,
  MoreHorizontalIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { HeaderActions } from "@/app/(main)/_components/header-actions";
import { AgentInstallGate, useBinaryStatus } from "@/components/agents/binary-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRunStartedToast } from "@/hooks/use-run-started-toast";
import { useSchedules } from "@/hooks/use-schedules";
import { useSettings } from "@/hooks/use-settings";
import { parseGlobalId } from "@/lib/aggregate/global-id";
import { connectionManager } from "@/lib/connections/manager";
import { normalizeTag, tagClassName } from "@/lib/kanban-tags";
import type { ConnectorKey, IdeaCategory } from "@/lib/schedule-ideas";
import { IDEA_CATEGORIES, SCHEDULE_IDEAS } from "@/lib/schedule-ideas";
import { openExternal } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { CreateScheduleInput, ScheduledTask } from "@/types/schedule";
import { describeSchedule, formatHm } from "@/types/schedule";
import type { AgentPreset } from "@/types/settings";
import { OLLAMA_INSTALL_INFO } from "@/types/settings";

/** The 4-colour Slack mark — lucide has no brand glyph, so inline it. */
function SlackMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" fill="none">
      <title>Slack</title>
      <path d="M5.04 15.16a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Z" fill="#e01e5a" />
      <path d="M6.31 15.16a2.52 2.52 0 0 1 5.04 0v6.32a2.52 2.52 0 0 1-5.04 0v-6.32Z" fill="#e01e5a" />
      <path d="M8.83 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83Z" fill="#36c5f0" />
      <path d="M8.83 6.31a2.52 2.52 0 0 1 0 5.04H2.52a2.52 2.52 0 0 1 0-5.04h6.31Z" fill="#36c5f0" />
      <path d="M18.96 8.83a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.83Z" fill="#2eb67d" />
      <path d="M17.69 8.83a2.52 2.52 0 0 1-5.04 0V2.52a2.52 2.52 0 0 1 5.04 0v6.31Z" fill="#2eb67d" />
      <path d="M15.16 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Z" fill="#ecb22e" />
      <path d="M15.16 17.69a2.52 2.52 0 0 1 0-5.04h6.32a2.52 2.52 0 0 1 0 5.04h-6.32Z" fill="#ecb22e" />
    </svg>
  );
}

/** The GitHub octocat mark — lucide dropped brand glyphs, so inline it. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" fill="currentColor">
      <title>GitHub</title>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58l-.01-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.21.7.82.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  );
}

/** Connector glyph at icon-card scale, keyed by connector. */
const CONNECTOR_ICON: Record<ConnectorKey, ReactNode> = {
  clock: <ClockIcon className="size-3 text-icon-primary/85" />,
  github: <GithubMark className="size-3 text-icon-primary/85" />,
  slack: <SlackMark className="size-3" />,
  mail: <MailIcon className="size-3 text-icon-primary/85" />,
  globe: <GlobeIcon className="size-3 text-icon-primary/85" />,
  shield: <ShieldIcon className="size-3 text-icon-primary/85" />,
};

/** The "flow" row of an idea card: glyphs joined by thin connector lines. */
function ConnectorFlow({ keys }: { keys: ConnectorKey[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {keys.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && <span aria-hidden className="h-px w-3.5 rounded-full bg-icon-tertiary" />}
          {CONNECTOR_ICON[k]}
        </Fragment>
      ))}
    </div>
  );
}

/** Pick a lucide glyph for an agent binary (no brand marks in lucide). */
function agentIcon(binary: string) {
  const b = binary.toLowerCase();
  if (b.includes("myra-embedded")) return SparklesIcon;
  if (b.includes("opencode")) return BotIcon;
  return TerminalIcon;
}

/** Friendly label of the connection that owns a (globalized) schedule id —
 *  "This device", a server name, etc. Mirrors Cursor's "Author" column. */
function scheduleSource(id: string): string {
  try {
    const { connId } = parseGlobalId(id);
    return connectionManager.get(connId)?.label ?? "";
  } catch {
    return "";
  }
}

/** Next-run countdown broken into a unit + count for i18n formatting. */
function relativeParts(iso?: string): { unit: "now" | "min" | "hours" | "days"; n: number } | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { unit: "now", n: 0 };
  const min = Math.round(ms / 60000);
  if (min < 60) return { unit: "min", n: min };
  const h = Math.round(min / 60);
  if (h < 48) return { unit: "hours", n: h };
  return { unit: "days", n: Math.round(h / 24) };
}

/** Sortable schedule columns. */
type SortKey = "name" | "source" | "agent" | "nextRun";
type SortDir = "asc" | "desc";

/** Dialog shown when no harness is installed and the user tries to create a patrol. */
function HarnessGateDialog({
  open,
  onOpenChange,
  harness,
  onContinueAnyway,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  harness: ReturnType<typeof useBinaryStatus>;
  onContinueAnyway: () => void;
}) {
  const t = useTranslations("schedules");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("harnessGate.title")}</DialogTitle>
          <DialogDescription>{t("harnessGate.description")}</DialogDescription>
        </DialogHeader>

        <AgentInstallGate state={harness} />

        <div className="rounded-md border border-dashed p-3">
          <p className="mb-1 font-medium text-xs">{t("harnessGate.ollamaTitle")}</p>
          <p className="mb-2 text-muted-foreground text-xs">{t("harnessGate.ollamaDescription")}</p>
          <button
            type="button"
            className="text-[11px] text-primary underline-offset-2 hover:underline"
            onClick={() => openExternal(OLLAMA_INSTALL_INFO.docsUrl)}
          >
            {t("harnessGate.ollamaLearnMore")}
          </button>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onContinueAnyway}>
            {t("harnessGate.continueAnyway")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SchedulesPage() {
  const t = useTranslations("schedules");
  const router = useRouter();
  const { schedules, loading, error, createSchedule, deleteSchedule, toggleEnabled, triggerNow } = useSchedules();
  const { settings } = useSettings();
  const showRunStarted = useRunStartedToast();

  const agentById = useMemo(() => new Map(settings.agents.map((p) => [p.id, p])), [settings.agents]);

  // Harness gate — the default agent must be available before creating a patrol.
  // (The built-in `myra-embedded` always reports installed, so it never blocks.)
  const defaultBinary = agentById.get(settings.defaultAgentId)?.binary ?? "opencode";
  const harness = useBinaryStatus(defaultBinary);
  const [gateOpen, setGateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Once the binary transitions to installed while the gate is open, close + proceed.
  useEffect(() => {
    if (gateOpen && harness.resolved && !harness.missing) {
      setGateOpen(false);
      const action = pendingAction;
      setPendingAction(null);
      action?.();
    }
  }, [gateOpen, harness.resolved, harness.missing, pendingAction]);

  const withHarnessCheck = useCallback(
    (action: () => void) => {
      if (harness.resolved && harness.missing) {
        setPendingAction(() => action);
        setGateOpen(true);
        return;
      }
      action();
    },
    [harness.resolved, harness.missing],
  );

  const [triggering, setTriggering] = useState<string | null>(null);

  // Listing controls (Figma filter row).
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<IdeaCategory>("personal");

  // Per-column sort + value filters (mirrors the Runs list view).
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [agentFilter, setAgentFilter] = useState<string[]>([]);

  // Anchor for the "browse templates" jump when the list pushes them off-screen.
  const ideasRef = useRef<HTMLDivElement>(null);

  const handleEdit = useCallback(
    (task: ScheduledTask) => {
      router.push(`/schedules/edit/?id=${encodeURIComponent(task.id)}`);
    },
    [router],
  );

  // Open the editor on a blank draft. Nothing is persisted until the user hits
  // "Add", so a cancelled patrol never lingers in the list (the editor creates it).
  const doCreate = useCallback(() => {
    router.push("/schedules/edit/?new=1");
  }, [router]);
  const handleCreate = useCallback(() => withHarnessCheck(doCreate), [withHarnessCheck, doCreate]);

  const handleTrigger = useCallback(
    async (id: string) => {
      setTriggering(id);
      try {
        const runId = await triggerNow(id);
        showRunStarted(runId);
      } finally {
        setTriggering(null);
      }
    },
    [triggerNow, showRunStarted],
  );

  // Clone a schedule onto its owning server, disabled, with a "(copy)" name.
  const handleDuplicate = useCallback(
    async (task: ScheduledTask) => {
      const { connId } = parseGlobalId(task.id);
      const input: CreateScheduleInput = {
        name: t("duplicateName", { name: task.name }),
        cardTitle: task.cardTitle,
        cardDescription: task.cardDescription,
        agentPrompt: task.agentPrompt,
        tags: task.tags,
        schedule: task.schedule,
        enabled: false,
        agentPresetId: task.agentPresetId,
        agentFlags: task.agentFlags,
        useWorktree: task.useWorktree,
        workingDir: task.workingDir,
        launchVia: task.launchVia,
        ollamaModel: task.ollamaModel,
      };
      try {
        await createSchedule(input, connId);
        toast.success(t("toast.duplicated", { name: task.name }));
      } catch (e) {
        toast.error(String(e));
      }
    },
    [createSchedule, t],
  );

  // Copy the raw schedule JSON to the clipboard.
  const handleCopyJson = useCallback(
    async (task: ScheduledTask) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(task, null, 2));
        toast.success(t("toast.copiedJson"));
      } catch {
        toast.error(t("toast.copyFailed"));
      }
    },
    [t],
  );

  // Stable order independent of enable/disable — toggling must not reorder rows.
  const sorted = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      }),
    [schedules],
  );

  // Tag suggestions: every tag already used across schedules.
  const availableTags = useMemo(
    () => [...new Set(schedules.flatMap((s) => s.tags.map(normalizeTag)).filter(Boolean))],
    [schedules],
  );

  // Display label of a schedule's agent (falls back to "No agent").
  const agentNameOf = useCallback(
    (s: ScheduledTask) => (s.agentPresetId ? (agentById.get(s.agentPresetId)?.name ?? t("noAgent")) : t("noAgent")),
    [agentById, t],
  );

  const toggleTagFilter = useCallback(
    (tag: string) => setTagFilter((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag])),
    [],
  );
  const toggleSourceFilter = useCallback(
    (v: string) => setSourceFilter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])),
    [],
  );
  const toggleAgentFilter = useCallback(
    (v: string) => setAgentFilter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])),
    [],
  );

  const clearFilters = useCallback(() => {
    setTagFilter([]);
    setSourceFilter([]);
    setAgentFilter([]);
    setQuery("");
    setSearchOpen(false);
  }, []);

  // Distinct column-filter options.
  const sourceOptions = useMemo(
    () => [...new Set(schedules.map((s) => scheduleSource(s.id)).filter(Boolean))],
    [schedules],
  );
  const agentOptions = useMemo(() => [...new Set(schedules.map(agentNameOf))], [schedules, agentNameOf]);

  // Apply tag chips + search query + column value filters to the listing.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((s) => {
      if (tagFilter.length && !s.tags.map(normalizeTag).some((tag) => tagFilter.includes(tag))) return false;
      if (sourceFilter.length && !sourceFilter.includes(scheduleSource(s.id))) return false;
      if (agentFilter.length && !agentFilter.includes(agentNameOf(s))) return false;
      if (q) {
        // Search across name, schedule, source, agent and tags.
        const haystack = [s.name, describeSchedule(s.schedule), scheduleSource(s.id), agentNameOf(s), ...s.tags]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, tagFilter, sourceFilter, agentFilter, query, agentNameOf]);

  // Column sort over the filtered set (stable createdAt order when unsorted).
  const rows = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    const nextTs = (s: ScheduledTask) =>
      s.enabled && s.nextRunAt ? Date.parse(s.nextRunAt) || Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    const val = (s: ScheduledTask): string | number => {
      switch (sort.key) {
        case "name":
          return s.name.toLowerCase();
        case "source":
          return scheduleSource(s.id).toLowerCase();
        case "agent":
          return agentNameOf(s).toLowerCase();
        case "nextRun":
          return nextTs(s);
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sort, agentNameOf]);

  const narrowed = tagFilter.length > 0 || sourceFilter.length > 0 || agentFilter.length > 0 || query.trim().length > 0;
  const ideas = useMemo(() => SCHEDULE_IDEAS.filter((i) => i.category === activeCategory), [activeCategory]);
  // Smooth-scroll to the templates section (used by the floating FAB).
  const scrollToIdeas = useCallback(() => ideasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), []);

  // Show the floating jump-to-templates FAB only while the templates are off-screen.
  // Callback ref wires up scroll + resize listeners when the templates node mounts
  // (it renders after loading) — a ResizeObserver also recomputes when the list
  // grows and pushes the templates below the fold.
  const [templatesOffscreen, setTemplatesOffscreen] = useState(false);
  const cleanupFabRef = useRef<(() => void) | null>(null);
  const setIdeasNode = useCallback((node: HTMLDivElement | null) => {
    ideasRef.current = node;
    cleanupFabRef.current?.();
    cleanupFabRef.current = null;
    if (!node) return;
    const compute = () => setTemplatesOffscreen(node.getBoundingClientRect().top > window.innerHeight - 80);
    const scroller = node.closest(".overflow-y-auto");
    compute();
    scroller?.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    const ro = new ResizeObserver(compute);
    ro.observe(document.body);
    cleanupFabRef.current = () => {
      scroller?.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
      ro.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-tertiary text-sm">{t("loading")}</p>
      </div>
    );
  }

  return (
    // Figma "App" content width — 968px, centred in the window.
    <div className="mx-auto flex w-full max-w-[968px] flex-col">
      <HarnessGateDialog
        open={gateOpen}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
          setGateOpen(open);
        }}
        harness={harness}
        onContinueAnyway={() => {
          setGateOpen(false);
          const action = pendingAction;
          setPendingAction(null);
          action?.();
        }}
      />

      {/* Title block (Figma: 6px left inset, no inner gap) */}
      <div className="flex flex-col pl-1.5">
        <h1 className="text-text-primary text-base font-medium">{t("title")}</h1>
        <p className="text-text-secondary text-xs font-light">{t("subtitle")}</p>
      </div>

      {/* Filter row: tag chips + search / new (24px below the title) */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto">
          <span className="shrink-0 pr-2 text-text-tertiary text-xs">{t("tags")}</span>
          {availableTags.length === 0 && <span className="shrink-0 text-text-tertiary/70 text-xs">{t("noTags")}</span>}
          {availableTags.map((tag) => {
            const active = tagFilter.includes(tag);
            return (
              <button
                type="button"
                key={tag}
                aria-pressed={active}
                onClick={() => toggleTagFilter(tag)}
                className={cn(
                  // Same per-tag palette as the Tools-column badges.
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs transition-all",
                  tagClassName(tag),
                  active ? "opacity-100 ring-1 ring-current/40" : "opacity-60 hover:opacity-100",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-icon-primary">
          {searchOpen ? (
            <div className="flex h-6 items-center gap-1.5">
              <SearchIcon className="size-4 shrink-0" />
              <input
                ref={(el) => el?.focus()}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    setSearchOpen(false);
                  }
                }}
                onBlur={() => {
                  if (!query.trim()) setSearchOpen(false);
                }}
                placeholder={t("searchPlaceholder")}
                className="w-44 bg-transparent text-text-primary text-xs outline-none placeholder:text-text-tertiary"
                aria-label={t("search")}
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearchOpen(false);
                }}
                className="shrink-0 transition-colors hover:text-icon-primary"
                aria-label={t("clearSearch")}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-6 items-center transition-colors hover:text-icon-primary"
              aria-label={t("search")}
            >
              <SearchIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* New Patrol lives in the shared top bar (left of the theme switcher). */}
      <HeaderActions>
        <button
          type="button"
          onClick={handleCreate}
          className="flex h-6 items-center gap-1 rounded-md bg-primary px-2 font-medium text-[11px] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <PlusIcon className="size-3.5 shrink-0" />
          <span className="whitespace-nowrap">{t("newSchedule")}</span>
        </button>
      </HeaderActions>

      {error && <p className="mt-2 text-destructive text-xs">{error}</p>}

      {/* Count line (Figma: right-aligned, light tertiary). */}
      <div className="mt-2 flex items-center justify-end gap-2 text-xs">
        {narrowed && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline"
          >
            {t("clearFilters")}
          </button>
        )}
        <span className="text-text-tertiary font-light">
          {t("showing", { shown: rows.length, total: filtered.length })}
        </span>
      </div>

      {/* Schedule list table */}
      <div className="mt-2 overflow-hidden rounded-card border border-border-cards bg-card-background">
        <Table>
          <TableHeader>
            <TableRow className="border-border-cards hover:bg-transparent">
              <ColHead label={t("columns.name")} sortKey="name" sort={sort} setSort={setSort} />
              <ColHead
                label={t("columns.source")}
                sortKey="source"
                sort={sort}
                setSort={setSort}
                className="w-[150px]"
                filter={{
                  options: sourceOptions.map((v) => ({ value: v, label: v })),
                  selected: sourceFilter,
                  onToggle: toggleSourceFilter,
                  onClear: () => setSourceFilter([]),
                }}
              />
              <ColHead
                label={t("columns.agent")}
                sortKey="agent"
                sort={sort}
                setSort={setSort}
                className="w-[150px]"
                filter={{
                  options: agentOptions.map((v) => ({ value: v, label: v })),
                  selected: agentFilter,
                  onToggle: toggleAgentFilter,
                  onClear: () => setAgentFilter([]),
                }}
              />
              <ColHead
                label={t("columns.tools")}
                sort={sort}
                setSort={setSort}
                className="w-[180px]"
                filter={{
                  options: availableTags.map((v) => ({ value: v, label: v })),
                  selected: tagFilter,
                  onToggle: toggleTagFilter,
                  onClear: () => setTagFilter([]),
                  colored: true,
                }}
              />
              <ColHead
                label={t("columns.nextRun")}
                sortKey="nextRun"
                sort={sort}
                setSort={setSort}
                className="w-[120px]"
              />
              <TableHead className="h-10 w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="border-border-cards hover:bg-transparent">
                <TableCell colSpan={6} className="h-24 text-center text-sm">
                  <span className="text-text-tertiary">{narrowed ? t("emptyFiltered") : t("emptyState")}</span>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((task) => {
                const agent = task.agentPresetId ? agentById.get(task.agentPresetId) : undefined;
                const source = scheduleSource(task.id);
                const rel = task.enabled ? relativeParts(task.nextRunAt) : null;
                return (
                  <TableRow
                    key={task.id}
                    onClick={() => handleEdit(task)}
                    className={cn(
                      "group cursor-pointer border-border-cards transition-colors hover:bg-secondary/40",
                      !task.enabled && "opacity-60",
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {/* Toggle must not open the editor. */}
                        <Switch
                          checked={task.enabled}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(v) => toggleEnabled(task.id, v)}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-text-primary text-sm">{task.name}</p>
                          <p className="truncate text-text-tertiary text-xs">{describeSchedule(task.schedule)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-text-secondary text-xs">{source || "—"}</TableCell>
                    <TableCell>
                      <AgentChip agent={agent} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {task.useWorktree && (
                          <span className="inline-flex items-center rounded-md border border-border-cards px-1.5 py-0.5 text-icon-tertiary">
                            <GitBranchIcon className="size-3" />
                          </span>
                        )}
                        {task.tags.length === 0 ? (
                          <span className="text-text-tertiary text-xs">—</span>
                        ) : (
                          task.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className={tagClassName(tag, "h-5 text-[10px]")}>
                              {tag}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {rel ? (
                        <div className="flex flex-col">
                          <span className="whitespace-nowrap text-text-primary text-xs">
                            {rel.unit === "now" ? t("relative.now") : t(`relative.${rel.unit}`, { n: rel.n })}
                          </span>
                          {task.nextRunAt && (
                            <span className="whitespace-nowrap text-text-tertiary text-[10px]">
                              {formatHm(task.nextRunAt)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-tertiary text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-md text-icon-tertiary transition-colors hover:bg-secondary hover:text-icon-primary"
                            aria-label={t("actions.edit")}
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleTrigger(task.id)} disabled={triggering === task.id}>
                            <PlayIcon className="size-3.5" />
                            {t("actions.runNow")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(task)}>
                            <CopyPlusIcon className="size-3.5" />
                            {t("actions.duplicate")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyJson(task)}>
                            <CopyIcon className="size-3.5" />
                            {t("actions.copyJson")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteSchedule(task.id)}
                          >
                            <TrashIcon className="size-3.5" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {/* Filters hide some rows — dashed footer to clear them (Runs list view). */}
        {narrowed && rows.length > 0 && filtered.length < schedules.length && (
          <button
            type="button"
            onClick={clearFilters}
            className="w-full border-border-cards border-t border-dashed py-3 text-center text-text-tertiary text-xs transition-colors hover:text-text-secondary"
          >
            {t("seeAll", { shown: filtered.length, total: schedules.length })}
          </button>
        )}
      </div>

      {/* Use-case ideas (Figma: category tabs + card grid, 40px below the table) */}
      <div ref={setIdeasNode} className="mt-10 flex scroll-mt-4 flex-col gap-2">
        <div className="flex items-center gap-2">
          <LayoutTemplateIcon className="size-3.5 text-text-tertiary" />
          <h2 className="text-text-secondary text-xs font-medium">{t("templatesHeading")}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {IDEA_CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                type="button"
                key={cat}
                aria-pressed={active}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-card px-2 py-1 text-xs transition-colors",
                  active ? "bg-secondary text-text-primary" : "text-text-tertiary hover:text-text-secondary",
                )}
              >
                {t(`ideas.categories.${cat}`)}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.map((idea) => {
            const openTemplate = () =>
              withHarnessCheck(() => router.push(`/schedules/edit/?template=${encodeURIComponent(idea.id)}`));
            return (
              <button
                type="button"
                key={idea.id}
                onClick={openTemplate}
                className="flex flex-col gap-2 rounded-card border border-border-cards bg-card-background p-2.5 pr-10 text-left transition-colors hover:border-border hover:bg-secondary/40"
              >
                <ConnectorFlow keys={idea.connectors} />
                <div className="flex flex-col gap-1">
                  <h3 className="text-text-primary text-xs font-medium">{t(`ideas.${idea.id}.name`)}</h3>
                  <p className="text-text-secondary text-[11px] font-light leading-relaxed">
                    {t(`ideas.${idea.id}.description`)}
                  </p>
                </div>
                <span className="self-start rounded-card border border-border-cards px-2 py-0.5 text-text-primary text-[11px] font-medium transition-colors hover:bg-secondary">
                  {t("ideas.add")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating jump-to-templates FAB: always on top, bottom-right, slides in
          from below once the templates scroll out of view. */}
      <button
        type="button"
        onClick={scrollToIdeas}
        aria-label={t("browseTemplates")}
        title={t("browseTemplates")}
        className={cn(
          "fixed right-5 bottom-5 z-50 flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-primary-foreground shadow-md ring-1 ring-black/10 transition-all duration-300 hover:bg-primary/90",
          templatesOffscreen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-12 opacity-0",
        )}
      >
        <LayoutTemplateIcon className="size-4 shrink-0" />
        <span className="whitespace-nowrap text-xs font-medium">{t("templatesShort")}</span>
      </button>
    </div>
  );
}

/** A column header with a hover-revealed sort + (optional) value-filter menu.
 *  Mirrors the Runs list view. `sortKey` omitted → header is filter-only. */
function ColHead({
  label,
  sortKey,
  sort,
  setSort,
  filter,
  className,
}: {
  label: string;
  sortKey?: SortKey;
  sort: { key: SortKey; dir: SortDir } | null;
  setSort: (next: { key: SortKey; dir: SortDir } | null) => void;
  filter?: {
    options: { value: string; label: string }[];
    selected: string[];
    onToggle: (value: string) => void;
    onClear: () => void;
    /** Render each option as a tag-coloured pill (Tools column). */
    colored?: boolean;
  };
  className?: string;
}) {
  const t = useTranslations("schedules");
  const sorted = sortKey != null && sort?.key === sortKey;
  const hasFilter = (filter?.selected.length ?? 0) > 0;
  const active = sorted || hasFilter;
  // Re-selecting the active direction clears the sort.
  const applySort = (dir: SortDir) =>
    sortKey != null && setSort(sorted && sort?.dir === dir ? null : { key: sortKey, dir });

  return (
    <TableHead className={cn("group/col h-10 text-text-tertiary text-xs font-normal", className)}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {sorted && (
            <button
              type="button"
              onClick={() => applySort(sort?.dir === "asc" ? "desc" : "asc")}
              aria-label={t(sort?.dir === "asc" ? "sort.desc" : "sort.asc")}
              className="rounded p-0.5 text-icon-primary transition"
            >
              {sort?.dir === "asc" ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />}
            </button>
          )}
          {(sortKey != null || (filter && filter.options.length > 0)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("columnMenu", { column: label })}
                  className={cn(
                    "rounded p-0.5 text-icon-tertiary opacity-0 transition hover:text-icon-primary group-hover/col:opacity-100 data-[state=open]:opacity-100",
                    active && "text-icon-primary opacity-100",
                  )}
                >
                  <ListFilterIcon className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {sortKey != null && (
                  <>
                    <DropdownMenuLabel className="text-text-tertiary text-xs">{t("sort.label")}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => applySort("asc")}>
                      <ArrowUpIcon className="size-3.5" />
                      {t("sort.asc")}
                      {sorted && sort?.dir === "asc" && <CheckIcon className="ml-auto size-3.5" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => applySort("desc")}>
                      <ArrowDownIcon className="size-3.5" />
                      {t("sort.desc")}
                      {sorted && sort?.dir === "desc" && <CheckIcon className="ml-auto size-3.5" />}
                    </DropdownMenuItem>
                    {sorted && (
                      <DropdownMenuItem className="text-text-tertiary" onClick={() => setSort(null)}>
                        {t("sort.clear")}
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {filter && filter.options.length > 0 && (
                  <>
                    {sortKey != null && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-text-tertiary text-xs">{t("filterBy")}</DropdownMenuLabel>
                    {filter.options.map((o) => (
                      <DropdownMenuCheckboxItem
                        key={o.value}
                        checked={filter.selected.includes(o.value)}
                        onCheckedChange={() => filter.onToggle(o.value)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {filter.colored ? (
                          <span
                            className={tagClassName(
                              o.value,
                              "rounded-full border px-2 py-0.5 text-[11px] leading-none",
                            )}
                          >
                            {o.label}
                          </span>
                        ) : (
                          o.label
                        )}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {hasFilter && (
                      <DropdownMenuItem className="text-text-tertiary" onClick={filter.onClear}>
                        {t("clearColumnFilter")}
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </TableHead>
  );
}

/** A bordered chip with the agent's icon + name (Figma Agent cell). */
function AgentChip({ agent }: { agent?: AgentPreset }) {
  const t = useTranslations("schedules");
  if (!agent) return <span className="text-text-tertiary text-xs">{t("noAgent")}</span>;
  const Icon = agentIcon(agent.binary);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-cards px-2 py-1 text-text-secondary text-xs">
      <Icon className="size-3.5 text-icon-primary" />
      {agent.name}
    </span>
  );
}
