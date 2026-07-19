"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { isTauri, invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  FolderIcon,
  GitBranchIcon,
  HomeIcon,
  LightbulbIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { HeaderActions } from "@/app/(main)/_components/header-actions";
import { AgentOptions } from "@/components/agents/agent-options";
import { RunsHistory } from "@/components/history/runs-history";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useKanban } from "@/hooks/use-kanban";
import { useRunStartedToast } from "@/hooks/use-run-started-toast";
import { useSchedules } from "@/hooks/use-schedules";
import { useSettings } from "@/hooks/use-settings";
import { loadTestResult } from "@/lib/agent-test-store";
import { connIdOf, entityIdOf, parseGlobalId } from "@/lib/aggregate/global-id";
import { resolveHomeFolder } from "@/lib/home-folder.client";
import { normalizeTag, TAG_SWATCH_CLASSES, tagClassName, tagHashIndex } from "@/lib/kanban-tags";
import { connectionManager } from "@/lib/connections/manager";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { getScheduleIdea } from "@/lib/schedule-ideas";
import { TOUR_APPLY_EVENT } from "@/lib/tour-steps";
import { cn } from "@/lib/utils";
import { useBreadcrumbOverride } from "@/stores/breadcrumb-store";
import { useNavGuard } from "@/stores/nav-guard-store";
import type { KanbanCard } from "@/types/kanban";
import type {
  Action as PatrolAction,
  ConnectorRule,
  CreateScheduleInput,
  EventTrigger,
  ScheduledTask,
  ScheduleKindType,
  UpdateScheduleInput,
} from "@/types/schedule";
import { defaultScheduleKind, describeSchedule } from "@/types/schedule";
import type { AgentPreset, PluginCatalogAction, PluginInfo } from "@/types/settings";

export default function ScheduleEditPage() {
  // useSearchParams() needs a Suspense boundary in the static export.
  return (
    <Suspense fallback={null}>
      <ScheduleEditScreen />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editable draft — the subset of a schedule the editor mutates. Compared against
// its initial snapshot to drive the dirty flag (Save button).
// ─────────────────────────────────────────────────────────────────────────────

type Draft = {
  enabled: boolean;
  // Patrol title + the descriptive line under it (editable in the header).
  name: string;
  cardDescription: string;
  agentPrompt: string;
  // Null while the user has removed the (single) schedule trigger — Save is then
  // blocked until a trigger is re-added. A patrol's one trigger is either a
  // time-based `schedule` OR a connector `eventTrigger`, never both — picking
  // one from Add Trigger clears the other (`schedule` still carries a dummy
  // value under the hood since the API field stays required; the server
  // ignores it when `eventTrigger` is set).
  schedule: ScheduledTask["schedule"] | null;
  eventTrigger: EventTrigger | null;
  // Post-run side effects dispatched to connectors when this patrol's card finishes.
  actions: NonNullable<ScheduledTask["actions"]>;
  // Repository/folder the run clones into. Empty string = "No Repository".
  workingDir: string;
  tags: string[];
  agentPresetId?: string;
  agentFlags: string[];
  useWorktree?: boolean;
  launchVia?: "direct" | "ollama";
  ollamaModel?: string;
};

function draftOf(task: ScheduledTask): Draft {
  return {
    enabled: task.enabled,
    name: task.name,
    cardDescription: task.cardDescription,
    agentPrompt: task.agentPrompt,
    schedule: task.schedule,
    eventTrigger: task.eventTrigger ?? null,
    actions: task.actions ?? [],
    workingDir: task.workingDir ?? "",
    tags: task.tags ?? [],
    agentPresetId: task.agentPresetId,
    agentFlags: task.agentFlags ?? [],
    useWorktree: task.useWorktree,
    launchVia: task.launchVia,
    ollamaModel: task.ollamaModel,
  };
}

function flagValue(flags: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return flags.find((f) => f.startsWith(prefix))?.slice(prefix.length);
}

function withFlagValue(flags: string[], name: string, value: string | undefined): string[] {
  const prefix = `--${name}=`;
  const rest = flags.filter((f) => !f.startsWith(prefix));
  return value ? [...rest, `${prefix}${value}`] : rest;
}

function ScheduleEditScreen() {
  const t = useTranslations("scheduleEdit");
  // Template copy lives under the `schedules.ideas.<id>` namespace (shared with
  // the schedules list); the editor reads it when creating from a template.
  const tIdeas = useTranslations("schedules.ideas");
  // Default name for a brand-new blank patrol (shared with the schedules list).
  const tSchedules = useTranslations("schedules");
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  // "New Patrol" opens the editor as `/schedules/edit/?new=1` with no real
  // schedule yet — nothing is persisted until the user hits Add. Mirrors the
  // template-creation flow below, so a cancelled draft never lingers in the list.
  const blankMode = params.get("new") === "1" && !id;

  const { loading, createSchedule, updateSchedule, toggleEnabled, triggerNow, byId, schedules } = useSchedules();
  // Live-refresh the "Operations & History" tab is global now — the board store
  // self-subscribes to `agent-result-changed`, so a finishing run shows up here
  // in real time without per-page wiring.
  const { cards, cancelAgent } = useKanban();
  const { settings } = useSettings();
  const showRunStarted = useRunStartedToast();

  // "Create from template" mode: opened as `/schedules/edit/?template=<id>` with
  // no real schedule yet. We synthesize a task from the template definition + its
  // i18n copy so the whole editor renders, and the primary action becomes "Add"
  // (creates the schedule, then lands on its real edit page).
  const templateId = params.get("template") ?? "";
  const idea = templateId ? getScheduleIdea(templateId) : undefined;
  const templateMode = !!idea && !id;

  // The "Edit Patrol" entry points (runs / logs / history) pass the card's raw,
  // connection-local task id, while schedule ids here are connection-scoped
  // GlobalIds (`connId::entityId`). Match on the entity-id suffix too so either
  // form resolves — otherwise the strict `byId` misses and shows "not found".
  const realTask = useMemo(() => {
    if (!id) return undefined;
    const exact = byId(id);
    if (exact) return exact;
    const entity = entityIdOf(id);
    return schedules.find((s) => entityIdOf(s.id) === entity);
  }, [id, byId, schedules]);
  const templateTask = useMemo<ScheduledTask | null>(() => {
    if (!idea) return null;
    // A template "once" trigger ships with an empty `at`; give it a sensible
    // future default so the trigger editor renders a valid value.
    const schedule = idea.schedule.type === "once" ? defaultScheduleKind("once") : idea.schedule;
    return {
      id: `template:${idea.id}`,
      name: tIdeas(`${idea.id}.name`),
      cardTitle: tIdeas(`${idea.id}.cardTitle`),
      cardDescription: tIdeas(`${idea.id}.description`),
      agentPrompt: tIdeas(`${idea.id}.prompt`),
      tags: idea.tags,
      schedule,
      enabled: true,
      createdAt: "",
    };
  }, [idea, tIdeas]);

  // Blank-creation mode: synthesize an empty, disabled patrol so the whole editor
  // renders. Like template mode, nothing is persisted until the user hits Add.
  const blankTask = useMemo<ScheduledTask | null>(() => {
    if (!blankMode) return null;
    return {
      id: "new:blank",
      name: tSchedules("newSchedule"),
      cardTitle: "",
      cardDescription: "",
      agentPrompt: "",
      tags: [],
      schedule: { type: "daily", time: "09:00" },
      // Active like a template-created one: a patrol you just filled in is a
      // patrol you meant to run, and starting it inactive only bought an extra
      // "Activate this patrol?" prompt on the way out.
      enabled: true,
      createdAt: "",
    };
  }, [blankMode, tSchedules]);

  const task = realTask ?? templateTask ?? blankTask;

  // Both template and blank modes defer persistence to the Add action.
  const draftMode = templateMode || blankMode;

  // Active tab is mirrored in the URL (`?tab=runs`) so that opening an operation
  // then hitting the top-bar back chevron — a hard browser navigation in the
  // static export, which remounts this page — restores the Operations & History
  // tab instead of snapping back to Settings.
  const [tab, setTab] = useState<"settings" | "runs">(() => (params.get("tab") === "runs" ? "runs" : "settings"));
  // Switch tab + sync the URL in place. `history.replaceState` (not router.replace)
  // updates the address without a navigation/remount — so unsaved edits survive —
  // and reuses the current `history.state` to keep NavHistoryControls' nav key intact.
  const selectTab = useCallback((next: "settings" | "runs") => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === "runs") url.searchParams.set("tab", "runs");
      else url.searchParams.delete("tab");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // ignore — URL just won't reflect the tab; in-page state still switches
    }
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // Suggestion handed over from a run's review footer (`?suggest=<note>`): the
  // "Request changes" feedback the user sent during an operation of this patrol.
  // Shown as a banner offering to fold it into the agent instruction; dismissal
  // is keyed on the note so a later navigation with a new note shows again.
  const suggestParam = (params.get("suggest") ?? "").trim();
  const [dismissedSuggest, setDismissedSuggest] = useState<string | null>(null);
  const suggestNote = suggestParam && dismissedSuggest !== suggestParam ? suggestParam : "";
  // Confirm dialog shown when cancelling with unsaved edits.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Activate-prompt shown when adding a template patrol that is still inactive.
  const [confirmActivate, setConfirmActivate] = useState(false);
  // Guards "Run now" against an accidental double-trigger while a prior manual
  // run of this same patrol is still in flight.
  const [confirmRunAgain, setConfirmRunAgain] = useState(false);
  // Surfaced only after the user tries to Save/Add without a folder selected.
  const [folderErrorShown, setFolderErrorShown] = useState(false);
  // Surfaced only after the user tries to Save/Add with an empty agent instruction.
  const [promptErrorShown, setPromptErrorShown] = useState(false);
  // Base folder the picker browses (Settings → defaults to OS home).
  const [homeFolder, setHomeFolder] = useState("");
  useEffect(() => {
    void resolveHomeFolder().then(setHomeFolder);
  }, []);

  // Selected folders (mirrored up from FolderSelect) + per-folder branch overrides.
  // `branchByFolder` is the working copy; `committedBranches` is the last-saved
  // snapshot — kept separate so Cancel can revert and dirty can detect changes
  // (these are app-local, persisted to localStorage only on Save).
  const [folders, setFolders] = useState<string[]>([]);
  const [branchByFolder, setBranchByFolder] = useState<Record<string, string>>({});
  const [committedBranches, setCommittedBranches] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!task) return;
    const saved = readBranchMap(task.id);
    setBranchByFolder(saved);
    setCommittedBranches(saved);
  }, [task?.id, task]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tag colors are global (by tag name, not per-schedule) so the same tag always
  // renders the same color across all patrols.
  const [tagColorMap, setTagColorMap] = useState<Record<string, number | string>>(readGlobalTagColorMap);
  const [committedTagColors, setCommittedTagColors] = useState<Record<string, number | string>>(readGlobalTagColorMap);

  // Global custom color palette (shared across all patrols, app-local).
  const [customPalette, setCustomPalette] = useState<string[]>(() => readCustomPalette());
  const [pendingDeleteColor, setPendingDeleteColor] = useState<{
    hex: string;
    affectedPatrolNames: string[];
  } | null>(null);

  const addCustomColor = useCallback((hex: string) => {
    setCustomPalette((prev) => {
      if (prev.includes(hex)) return prev;
      const next = [...prev, hex];
      writeCustomPalette(next);
      return next;
    });
  }, []);

  const requestDeleteCustomColor = useCallback(
    (hex: string) => {
      // Tags in the global map that use this hex.
      const affectedTags = new Set(
        Object.entries(tagColorMap)
          .filter(([, v]) => v === hex)
          .map(([tag]) => tag),
      );
      // Schedules that have any of those tags.
      const affected = affectedTags.size > 0 ? schedules.filter((s) => s.tags?.some((t) => affectedTags.has(t))) : [];
      if (affected.length > 0) {
        setPendingDeleteColor({ hex, affectedPatrolNames: affected.map((s) => s.name) });
      } else {
        setCustomPalette((prev) => {
          const next = prev.filter((c) => c !== hex);
          writeCustomPalette(next);
          return next;
        });
      }
    },
    [schedules, tagColorMap],
  );

  const confirmDeleteCustomColor = useCallback(() => {
    if (!pendingDeleteColor) return;
    const { hex } = pendingDeleteColor;
    setCustomPalette((prev) => {
      const next = prev.filter((c) => c !== hex);
      writeCustomPalette(next);
      return next;
    });
    const filter = (m: Record<string, number | string>) =>
      Object.fromEntries(Object.entries(m).filter(([, v]) => v !== hex));
    setTagColorMap((prev) => {
      const next = filter(prev);
      writeGlobalTagColorMap(next);
      return next;
    });
    setCommittedTagColors((prev) => filter(prev));
    setPendingDeleteColor(null);
  }, [pendingDeleteColor]);

  // Resolve a folder's branch: explicit override → (primary only) the saved
  // agentFlags branch → "".
  const branchOf = useCallback(
    (folder: string, isPrimary: boolean) =>
      branchByFolder[folder] ?? (isPrimary ? (flagValue(draft?.agentFlags ?? [], "branch") ?? "") : ""),
    [branchByFolder, draft?.agentFlags],
  );

  const setBranch = useCallback((folder: string, branch: string, isPrimary: boolean) => {
    // Working copy only — committed to localStorage on Save, reverted on Cancel.
    if (folder) setBranchByFolder((prev) => ({ ...prev, [folder]: branch }));
    // Primary folder's branch is also persisted server-side via agentFlags.
    if (isPrimary) {
      setDraft((d) => (d ? { ...d, agentFlags: withFlagValue(d.agentFlags, "branch", branch) } : d));
    }
  }, []);

  // Seed the draft once the schedule resolves, re-seeding only when a *different*
  // schedule id loads — so unrelated background updates to the task object (e.g.
  // nextRunAt ticks) never clobber in-progress edits.
  const seededId = useRef<string | null>(null);
  useEffect(() => {
    if (task && seededId.current !== task.id) {
      seededId.current = task.id;
      setDraft(draftOf(task));
    }
  }, [task]);

  // Flag a disabled patrol right in the breadcrumb leaf (uses the live draft state
  // so it reflects the toggle immediately).
  const breadcrumbEnabled = draft?.enabled ?? task?.enabled ?? true;
  const breadcrumbName = (draft?.name?.trim() || task?.name) ?? "";
  useBreadcrumbOverride(
    task
      ? {
          label: breadcrumbEnabled ? breadcrumbName : `${breadcrumbName} (${t("inactive").toLowerCase()})`,
          href: templateMode
            ? `/schedules/edit/?template=${encodeURIComponent(templateId)}`
            : blankMode
              ? "/schedules/edit/?new=1"
              : `/schedules/edit/?id=${encodeURIComponent(task.id)}`,
          // Template mode gets an intermediate "Template" crumb (non-clickable:
          // templates have no route of their own, just a section on /schedules).
          section: templateMode ? { label: t("templateCrumb") } : undefined,
        }
      : null,
  );

  const branchesDirty = useMemo(
    () => JSON.stringify(branchByFolder) !== JSON.stringify(committedBranches),
    [branchByFolder, committedBranches],
  );

  const tagColorsDirty = useMemo(
    () => JSON.stringify(tagColorMap) !== JSON.stringify(committedTagColors),
    [tagColorMap, committedTagColors],
  );

  const dirty = useMemo(() => {
    if (!task || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(draftOf(task)) || branchesDirty || tagColorsDirty;
  }, [task, draft, branchesDirty, tagColorsDirty]);

  // Pending navigation to run once the user confirms discarding unsaved edits.
  // The Cancel button sets it to `router.back`; the top-bar chevrons inject their
  // own back/forward nav via the registered nav guard.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const pendingNavRef = useRef<() => void>(() => router.back());

  // Intercept the top-bar back/forward chevrons while there are unsaved edits,
  // routing them through the same discard-confirmation dialog as Cancel.
  const guardBlock = useCallback(() => dirtyRef.current, []);
  const guardOnBlocked = useCallback((proceed: () => void) => {
    pendingNavRef.current = proceed;
    setConfirmDiscard(true);
  }, []);
  useNavGuard({ block: guardBlock, onBlocked: guardOnBlocked });

  // Flag the empty agent instruction and bring it into view (it sits below the
  // fold, so the inline error would otherwise be missed). Switches to the
  // Settings tab first, where the field lives. (No toast — the combined one is
  // emitted by validateRequired.)
  const flagMissingPrompt = useCallback(() => {
    setPromptErrorShown(true);
    selectTab("settings");
    // setTimeout (not rAF) so it runs after the Settings tab mounts AND isn't
    // throttled when the window is briefly unfocused.
    setTimeout(() => {
      const el = document.getElementById("agent-instruction-input");
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    }, 0);
  }, [selectTab]);

  // Surface *every* missing required field at once (trigger / instruction /
  // folder) — inline state per field plus a single combined toast — and return
  // true when the draft is complete enough to save/add.
  const validateRequired = useCallback(
    (d: Draft) => {
      const missing: string[] = [];
      if (!d.schedule && !d.eventTrigger) missing.push(t("fields.trigger"));
      if (!d.agentPrompt.trim()) {
        missing.push(t("fields.instruction"));
        flagMissingPrompt();
      }
      if (!d.workingDir.trim()) {
        missing.push(t("fields.folder"));
        setFolderErrorShown(true);
      }
      if (missing.length) {
        const list = new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(missing);
        toast.error(t("toast.needFields", { fields: list }));
        return false;
      }
      return true;
    },
    [t, flagMissingPrompt],
  );

  const save = useCallback(async () => {
    if (!task || !draft || !dirty) return;
    if (!validateRequired(draft) || !draft.schedule) return;
    setSaving(true);
    try {
      const input: UpdateScheduleInput = {
        id: task.id,
        name: draft.name.trim() || task.name,
        // The form edits only `name`; the materialized card's title mirrors it.
        cardTitle: draft.name.trim() || task.name,
        cardDescription: draft.cardDescription,
        agentPrompt: draft.agentPrompt,
        tags: draft.tags,
        schedule: draft.schedule,
        eventTrigger: draft.eventTrigger ?? undefined,
        actions: draft.actions.length ? draft.actions : undefined,
        enabled: draft.enabled,
        agentPresetId: draft.agentPresetId,
        agentFlags: draft.agentFlags.length ? draft.agentFlags : undefined,
        useWorktree: draft.useWorktree,
        workingDir: draft.workingDir.trim() || undefined,
        launchVia: draft.launchVia,
        ollamaModel: draft.ollamaModel,
      };
      await updateSchedule(input);
      // Commit the app-local per-folder branch overrides alongside the save.
      setLocalStorageValue(branchMapKey(task.id), JSON.stringify(branchByFolder));
      setCommittedBranches(branchByFolder);
      writeGlobalTagColorMap(tagColorMap);
      setCommittedTagColors(tagColorMap);
      toast.success(t("toast.saved"));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }, [task, draft, dirty, branchByFolder, tagColorMap, updateSchedule, validateRequired, t]);

  // Template mode: create a real schedule from the prefilled draft, then land on
  // its actual edit page (so the user can keep tweaking / see its runs).
  const add = useCallback(
    async (enabled: boolean) => {
      if (!task || !draft) return;
      if (!validateRequired(draft) || !draft.schedule) return;
      setSaving(true);
      try {
        const input: CreateScheduleInput = {
          name: draft.name.trim() || task.name,
          // The form edits only `name`; the materialized card's title mirrors it.
          cardTitle: draft.name.trim() || task.name,
          cardDescription: draft.cardDescription,
          agentPrompt: draft.agentPrompt,
          tags: draft.tags,
          schedule: draft.schedule,
          eventTrigger: draft.eventTrigger ?? undefined,
          actions: draft.actions.length ? draft.actions : undefined,
          enabled,
          agentPresetId: draft.agentPresetId,
          agentFlags: draft.agentFlags.length ? draft.agentFlags : undefined,
          useWorktree: draft.useWorktree,
          workingDir: draft.workingDir.trim() || undefined,
          launchVia: draft.launchVia,
          ollamaModel: draft.ollamaModel,
        };
        const created = await createSchedule(input);
        // Persist app-local per-folder branch overrides under the new schedule id.
        if (Object.keys(branchByFolder).length > 0) {
          setLocalStorageValue(branchMapKey(created.id), JSON.stringify(branchByFolder));
        }
        writeGlobalTagColorMap(tagColorMap);
        toast.success(t("toast.added"));
        router.replace("/schedules/");
      } catch (e) {
        toast.error(String(e));
      } finally {
        setSaving(false);
      }
    },
    [task, draft, branchByFolder, tagColorMap, createSchedule, router, validateRequired, t],
  );

  // Runs belonging to this schedule: cards it materialized share its card title
  // (and tags). Newest first.
  const runs = useMemo(() => {
    if (!task) return [] as KanbanCard[];
    const tagSet = new Set(task.tags);
    // `linkedTaskId` isn't globalized on the card (only `id` is), so compare on
    // the entity id within the card's own connection rather than the GlobalId.
    const { connId: taskConn, entityId: taskEntity } = parseGlobalId(task.id);
    const linkedToTask = (c: KanbanCard) =>
      !!c.linkedTaskId && connIdOf(c.id) === taskConn && entityIdOf(c.linkedTaskId) === taskEntity;
    return (
      cards
        // Keep auto-archived cards (status "trashed" + `archivedAt`) so History
        // still lists them; only drop manually-deleted (trashed, no `archivedAt`)
        // and drafts.
        .filter((c) => (c.status !== "trashed" || !!c.archivedAt) && c.status !== "draft")
        // Primary match: the card's direct link to this schedule (set when it was
        // materialized / launched). Title + shared-tag matching is a legacy
        // fallback for cards that predate `linkedTaskId`.
        .filter((c) => linkedToTask(c) || c.title === task.cardTitle || c.tags.some((tg) => tagSet.has(tg)))
        .sort((a, b) => triggeredAt(b).localeCompare(triggeredAt(a)))
    );
  }, [cards, task]);

  // Stoppable = a run that's actually executing (in_progress) or queued to run
  // (backlog, `agentQueued`). "Needs you" (waiting_feedback / awaiting_review)
  // has no live process to kill, so it never shows Stop all.
  const runningRuns = useMemo(() => runs.filter((c) => c.status === "in_progress" || c.agentQueued), [runs]);

  // Tag vocabulary suggested in the editor — every distinct tag used across cards.
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) for (const tg of c.tags) set.add(tg);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [cards]);

  // Stop = cancel the agent (like the per-card Stop): the card lands in Done with
  // its run marked cancelled and STAYS on the board — not trashed/removed.
  const stopAll = useCallback(() => {
    const ids = runningRuns.map((c) => c.id);
    if (!ids.length) return;
    void Promise.all(ids.map((rid) => cancelAgent(rid).catch(() => false))).then((results) => {
      const stopped = results.filter(Boolean).length;
      if (stopped) toast.success(t("toast.stopped", { count: stopped }));
    });
  }, [runningRuns, cancelAgent, t]);

  const doRunNow = useCallback(() => {
    if (!task) return;
    void triggerNow(task.id).then((runId) => showRunStarted(runId));
  }, [task, triggerNow, showRunStarted]);

  const runNow = useCallback(() => {
    if (!task) return;
    // Only warn when a run of this patrol is already in progress — starting a
    // second one would run it in parallel.
    if (runningRuns.length > 0) {
      setConfirmRunAgain(true);
      return;
    }
    doRunNow();
  }, [task, runningRuns, doRunNow]);

  // Fold the run feedback into the agent instruction as an addendum the user
  // can then rework — marks the draft dirty so Save lights up.
  const applySuggestion = useCallback(() => {
    if (!suggestNote) return;
    setDraft((d) =>
      d
        ? { ...d, agentPrompt: d.agentPrompt.trim() ? `${d.agentPrompt.trimEnd()}\n\n${suggestNote}` : suggestNote }
        : d,
    );
    setDismissedSuggest(suggestParam);
    selectTab("settings");
    // setTimeout (not rAF) so it runs after the Settings tab mounts.
    setTimeout(() => {
      document.getElementById("agent-instruction-input")?.scrollIntoView({ block: "center" });
    }, 0);
  }, [suggestNote, suggestParam, selectTab]);

  if (loading && !task) {
    return <div className="flex h-full items-center justify-center text-sm text-text-tertiary">{t("loading")}</div>;
  }
  if (!task || !draft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-text-tertiary">{t("notFound")}</p>
        <button
          type="button"
          onClick={() => router.push("/schedules")}
          className="text-text-secondary text-xs underline"
        >
          {t("backToSchedules")}
        </button>
      </div>
    );
  }

  // A working folder is mandatory before a patrol can be saved/added. The Home
  // folder is a valid choice but must be picked explicitly — it is not a default.
  const hasFolder = !!draft.workingDir.trim();

  return (
    <div className="mx-auto flex w-full max-w-[968px] flex-col">
      {/* Top-bar actions: Stop all runs (when runs are live) + Save (when dirty) +
          Run now — portalled into the shared header, left of the theme switcher. */}
      <HeaderActions>
        {!draftMode && runningRuns.length > 0 && (
          <button
            type="button"
            onClick={stopAll}
            className="rounded-md border border-destructive bg-card-background px-2 py-0.5 font-medium text-[11px] text-destructive transition-colors hover:bg-destructive/10"
          >
            {t("stopAllRuns")}
          </button>
        )}
        {/* Template / blank modes: the primary action creates the schedule ("Add");
            the regular editor saves edits ("Save", enabled only when dirty). */}
        <button
          type="button"
          onClick={
            draftMode
              ? () => {
                  // Surface all missing fields before the activate prompt.
                  if (!validateRequired(draft)) return;
                  // Inactive-by-default draft: ask whether to activate first.
                  if (!draft.enabled) {
                    setConfirmActivate(true);
                    return;
                  }
                  void add(true);
                }
              : save
          }
          disabled={saving || (!draftMode && !dirty)}
          // Spotlight-tour anchor — see lib/tour-steps.ts.
          data-tour="save-patrol"
          className={cn(
            "rounded-md px-2 py-0.5 font-medium text-[11px] transition-colors",
            draftMode || dirty
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-muted/40 text-text-tertiary",
          )}
        >
          {draftMode ? t("add") : t("save")}
        </button>
        <button
          type="button"
          onClick={() => {
            // With unsaved edits, confirm before discarding; otherwise leave straight away.
            if (dirty) {
              pendingNavRef.current = () => router.back();
              setConfirmDiscard(true);
              return;
            }
            router.back();
          }}
          disabled={saving}
          className="rounded-md border border-border px-2 py-0.5 font-medium text-[11px] text-text-secondary transition-colors hover:bg-muted/40 hover:text-text-primary"
        >
          {t("cancel")}
        </button>
        {!draftMode && (
          <button
            type="button"
            aria-label={t("runNow")}
            onClick={runNow}
            className="flex size-7 items-center justify-center rounded-md text-icon-primary transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <PlayIcon className="size-[18px]" />
          </button>
        )}
      </HeaderActions>

      {/* Discard-confirmation — guards the Cancel button when there are unsaved edits. */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("discardDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("discardKeepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDraft(draftOf(task));
                setBranchByFolder(committedBranches);
                setTagColorMap(committedTagColors);
                // A discarded draft (new/template) must not be reachable again via
                // the forward chevron. A plain router.back() (no nav-history "back"
                // intent) is treated as a fresh navigation, dropping the forward
                // entry — same as Cancel. Real patrols keep normal back/forward.
                if (draftMode) router.back();
                else pendingNavRef.current();
              }}
            >
              {t("discardConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate-prompt — shown when adding a template patrol left inactive. */}
      <AlertDialog open={confirmActivate} onOpenChange={setConfirmActivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("activateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("activateDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("activateCancel")}</AlertDialogCancel>
            <button
              type="button"
              onClick={() => {
                setConfirmActivate(false);
                void add(false);
              }}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-text-secondary text-xs transition-colors hover:bg-muted/40 hover:text-text-primary"
            >
              {t("activateKeepInactive")}
            </button>
            <AlertDialogAction
              onClick={() => {
                setConfirmActivate(false);
                void add(true);
              }}
            >
              {t("activateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Run-now guard — fires when this patrol already has a run in flight. */}
      <AlertDialog open={confirmRunAgain} onOpenChange={setConfirmRunAgain}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("runAgainTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("runAgainDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("runAgainCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRunAgain(false);
                doRunNow();
              }}
            >
              {t("runAgainConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Title block — editable name + description. pb-4 / pl-1.5 from the Figma "Title" frame. */}
      <header className="flex flex-col gap-0.5 pr-0 pb-4 pl-1.5">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
          placeholder={t("namePlaceholder")}
          aria-label={t("nameLabel")}
          // Spotlight-tour anchor — see lib/tour-steps.ts.
          data-tour="patrol-name"
          className="-ml-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-medium text-[16px] text-text-primary leading-tight outline-none transition-colors placeholder:text-text-tertiary hover:border-border/60 focus:border-border focus:bg-card-background"
        />
        <textarea
          value={draft.cardDescription}
          onChange={(e) => setDraft((d) => (d ? { ...d, cardDescription: e.target.value } : d))}
          placeholder={t("subtitle")}
          aria-label={t("descriptionLabel")}
          data-tour="patrol-subtitle"
          rows={1}
          className="-ml-1.5 resize-none rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-light text-[12px] text-text-secondary leading-tight outline-none transition-colors placeholder:text-text-tertiary hover:border-border/60 focus:border-border focus:bg-card-background"
        />
      </header>

      {/* Status toggle + repository + branch — divider-separated inline items. */}
      <div className="flex items-center">
        <div className="flex items-center gap-2 border-border border-r pr-2">
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => {
              setDraft((d) => (d ? { ...d, enabled: v } : d));
              // No backend schedule exists yet in template/blank mode — the toggle
              // just seeds the draft's enabled flag, persisted on "Add".
              if (!draftMode) void toggleEnabled(task.id, v);
            }}
            className="scale-[0.7]"
          />
          <span className="text-[12px] text-text-secondary">{draft.enabled ? t("active") : t("inactive")}</span>
        </div>
        {/* data-tour: spotlight-tour anchor. `data-tour-satisfied` is what holds
            that step's "Next" back until a folder is really chosen — the tour
            can't read the draft. See lib/tour-steps.ts. */}
        <div
          className="flex items-center border-border border-r px-2"
          data-tour="patrol-folder"
          data-tour-satisfied={hasFolder ? "true" : "false"}
        >
          <FolderSelect
            scheduleId={task.id}
            // Template / blank drafts start fresh every time — don't seed or
            // persist the per-schedule folder list (it would carry over).
            ephemeral={draftMode}
            value={draft.workingDir}
            invalid={folderErrorShown && !hasFolder}
            homeFolder={homeFolder}
            onChange={(v) => {
              setDraft((d) => (d ? { ...d, workingDir: v } : d));
              // Any folder change clears the post-save warning; it only returns on
              // the next Save/Add attempt with no folder.
              setFolderErrorShown(false);
            }}
            onFoldersChange={setFolders}
            t={t}
          />
        </div>
        <div className="flex items-center border-border border-r px-2">
          {folders.length >= 2 ? (
            // One branch per selected folder.
            <MultiBranchSelect folders={folders} branchOf={branchOf} onChange={setBranch} t={t} />
          ) : (
            <BranchSelect
              value={branchOf(folders[0] ?? draft.workingDir, true)}
              repoPath={folders[0] ?? draft.workingDir}
              onChange={(v) => setBranch(folders[0] ?? draft.workingDir, v, true)}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Folder is mandatory — surfaced only after a Save/Add attempt with none set. */}
      {folderErrorShown && !hasFolder && (
        <p className="flex items-center gap-1 pt-1.5 pl-0.5 text-[11px] text-destructive">
          <TriangleAlertIcon className="size-3" />
          {t("folderRequired")}
        </p>
      )}

      {/* Tags row. */}
      <TagsEditor
        tags={draft.tags}
        suggestions={tagSuggestions}
        onChange={(tags) => setDraft((d) => (d ? { ...d, tags } : d))}
        tagColors={tagColorMap}
        onColorChange={(tag, value) => {
          setTagColorMap((m) =>
            value === null ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== tag)) : { ...m, [tag]: value },
          );
        }}
        customPalette={customPalette}
        onAddCustomColor={addCustomColor}
        onDeleteCustomColor={requestDeleteCustomColor}
        t={t}
      />

      {/* Patrol-change suggestion — handed over from a finished run where the
          user requested changes. Apply appends it to the agent instruction. */}
      {suggestNote && !draftMode && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border-cards bg-card-background p-4">
          <div className="flex items-center gap-2">
            <LightbulbIcon className="size-4 text-text-secondary" />
            <span className="font-medium text-[12px] text-text-primary">{t("suggestion.title")}</span>
          </div>
          <p className="whitespace-pre-wrap text-[12px] text-text-secondary">{suggestNote}</p>
          <p className="text-[11px] text-text-tertiary">{t("suggestion.hint")}</p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={applySuggestion}
              className="rounded-md bg-foreground px-2 py-0.5 font-medium text-[11px] text-background transition-colors hover:bg-foreground/90"
            >
              {t("suggestion.apply")}
            </button>
            <button
              type="button"
              onClick={() => setDismissedSuggest(suggestParam)}
              className="rounded-md border border-border px-2 py-0.5 font-medium text-[11px] text-text-secondary transition-colors hover:bg-muted/40 hover:text-text-primary"
            >
              {t("suggestion.dismiss")}
            </button>
          </div>
        </div>
      )}

      {/* Settings / Runs & History tabs. The Runs tab is hidden in template/blank
          mode — a not-yet-created schedule has no run history. */}
      {!draftMode && (
        <div className="flex items-center gap-1.5 pt-4">
          <SegTab active={tab === "settings"} onClick={() => selectTab("settings")}>
            {t("tabs.settings")}
          </SegTab>
          <SegTab active={tab === "runs"} onClick={() => selectTab("runs")}>
            {t("tabs.runs")}
          </SegTab>
        </div>
      )}

      {/* Runs tab matches the History page's bottom spacing (just the layout
          padding); the Settings tab keeps its roomier pb-10. */}
      <div className={cn("pt-2", draftMode || tab === "settings" ? "pb-10" : "pb-0")}>
        {draftMode || tab === "settings" ? (
          <SettingsTab
            draft={draft}
            setDraft={setDraft}
            agents={settings.agents}
            defaultAgentId={settings.defaultAgentId}
            promptError={promptErrorShown && !draft.agentPrompt.trim()}
            onPromptInput={() => setPromptErrorShown(false)}
            t={t}
          />
        ) : (
          <RunsHistory cards={runs} includeLive />
        )}
      </div>

      <AlertDialog open={!!pendingDeleteColor} onOpenChange={(open) => !open && setPendingDeleteColor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteColorTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteColorDescription", {
                patrols: pendingDeleteColor?.affectedPatrolNames.join(", ") ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteColorCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCustomColor}>{t("deleteColorConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function SegTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={active ? "active" : "inactive"}
      className={cn(
        "rounded-[10px] px-2 py-[3px] text-[12px] transition-colors",
        active ? "bg-card-background-secondary text-text-primary" : "text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

function triggeredAt(card: KanbanCard): string {
  return card.agentRunStartedAt ?? card.createdAt;
}

/** Sensible default tags offered when the workspace has no tag vocabulary yet. */
const DEFAULT_TAG_SUGGESTIONS = [
  "daily",
  "weekly",
  "review",
  "urgent",
  "summary",
  "scheduled",
  "tests",
  "security",
  "triage",
  "cleanup",
];

/** Editable tag chips + a "+ New tag" inline input with suggestions. */
function TagsEditor({
  tags,
  suggestions,
  onChange,
  tagColors,
  onColorChange,
  customPalette,
  onAddCustomColor,
  onDeleteCustomColor,
  t,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  tagColors: Record<string, number | string>;
  onColorChange: (tag: string, value: number | string | null) => void;
  customPalette: string[];
  onAddCustomColor: (hex: string) => void;
  onDeleteCustomColor: (hex: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput("");
  };
  const close = () => {
    setInput("");
    setAdding(false);
  };

  const q = input.trim().toLowerCase();
  const pool = [...new Set([...suggestions, ...DEFAULT_TAG_SUGGESTIONS])];
  const matches = pool.filter((s) => !tags.includes(s) && (!q || s.toLowerCase().includes(q))).slice(0, 8);
  const showCreate = q && !pool.some((s) => s.toLowerCase() === q) && !tags.includes(normalizeTag(input));

  const BASE_CHIP = "flex h-6 items-center gap-1 rounded-2xl border px-2 text-[12px]";

  return (
    // data-tour anchors the row, not the "New tag" button: the button is swapped
    // out for the inline field the moment it's pressed, and a target that
    // vanishes reads to the tour as "the user navigated away" (see
    // lib/tour-steps.ts).
    <div className="flex items-center gap-2 pt-4" data-tour="patrol-tag">
      <span className="pr-1 text-[12px] text-text-tertiary">{t("tags")}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => {
          const colorOverride = tagColors[tag];
          const isCustomHex = typeof colorOverride === "string";
          const paletteOverride = typeof colorOverride === "number" ? colorOverride : undefined;

          const chipClassName = isCustomHex ? BASE_CHIP : tagClassName(tag, BASE_CHIP, paletteOverride);
          const chipStyle = isCustomHex
            ? { backgroundColor: `${colorOverride}20`, borderColor: `${colorOverride}40`, color: colorOverride }
            : undefined;

          return (
            <Popover key={tag}>
              <div className={chipClassName} style={chipStyle}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("changeColor")}
                    className="cursor-pointer text-[12px] leading-none"
                  >
                    {tag}
                  </button>
                </PopoverTrigger>
                <button
                  type="button"
                  aria-label={t("removeTag")}
                  onClick={() => onChange(tags.filter((x) => x !== tag))}
                  className="opacity-60 transition-opacity hover:opacity-100"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
              <PopoverContent side="top" align="start" className="w-auto p-0">
                <TagColorPicker
                  tag={tag}
                  tagColors={tagColors}
                  customPalette={customPalette}
                  onColorChange={onColorChange}
                  onAddCustomColor={onAddCustomColor}
                  onDeleteCustomColor={onDeleteCustomColor}
                  t={t}
                />
              </PopoverContent>
            </Popover>
          );
        })}
        {adding ? (
          <div className="relative">
            <input
              // biome-ignore lint/a11y/noAutofocus: focus the inline tag field the user just opened.
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              // Delay close so a suggestion click (mousedown) registers first.
              onBlur={() => setTimeout(close, 120)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(input);
                } else if (e.key === "Escape") {
                  close();
                }
              }}
              placeholder={t("tagPlaceholder")}
              className="h-6 w-32 rounded-2xl border border-border bg-transparent px-2 text-[12px] text-text-primary outline-none"
            />
            {(matches.length > 0 || showCreate) && (
              <div className="absolute top-7 left-0 z-50 flex max-h-56 w-44 flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                {matches.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(s)}
                    className={tagClassName(
                      s,
                      "flex h-6 w-fit items-center rounded-2xl border px-2 text-[12px] transition-opacity hover:opacity-80",
                    )}
                  >
                    {s}
                  </button>
                ))}
                {showCreate && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(input)}
                    className="flex items-center gap-1 rounded px-1.5 py-1 text-left text-[12px] text-text-secondary transition-colors hover:bg-muted/40 hover:text-text-primary"
                  >
                    <PlusIcon className="size-3" />
                    {t("createTag", { tag: normalizeTag(input) })}
                  </button>
                )}
                {/* Hint that typing a new name creates a tag (the create button
                    already covers the case where a name is being typed). */}
                {!showCreate && (
                  <div className="mt-0.5 border-border border-t px-1.5 pt-1 text-[11px] text-text-tertiary">
                    {t("createTagHint")}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            // The tour's "fill this in" reaches for this inside the ringed row.
            data-tour-add-tag=""
            className="flex h-6 items-center rounded-2xl border border-border-cards bg-muted/30 px-2 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
          >
            {t("newTag")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Color picker popover content — predefined swatches + custom palette + add button. */
function TagColorPicker({
  tag,
  tagColors,
  customPalette,
  onColorChange,
  onAddCustomColor,
  onDeleteCustomColor,
  t,
}: {
  tag: string;
  tagColors: Record<string, number | string>;
  customPalette: string[];
  onColorChange: (tag: string, value: number | string | null) => void;
  onAddCustomColor: (hex: string) => void;
  onDeleteCustomColor: (hex: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [addingColor, setAddingColor] = useState(false);
  const [newColorHex, setNewColorHex] = useState("#6366f1");

  const colorOverride = tagColors[tag];
  const isCustomHex = typeof colorOverride === "string";
  const paletteOverride = typeof colorOverride === "number" ? colorOverride : undefined;
  const effectiveIndex = paletteOverride ?? tagHashIndex(tag);
  const hasOverride = colorOverride !== undefined;

  return (
    <div className="flex flex-col gap-1.5 p-2">
      {/* Swatch row: 8 predefined + custom palette + "+" */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TAG_SWATCH_CLASSES.map((cls, i) => (
          <button
            key={cls}
            type="button"
            aria-label={`Color ${i + 1}`}
            onClick={() => onColorChange(tag, i)}
            className={cn(
              "size-5 rounded-full border-2 transition-transform hover:scale-110",
              cls,
              !isCustomHex && effectiveIndex === i && "ring-2 ring-current ring-offset-1",
            )}
          />
        ))}

        {customPalette.map((hex) => (
          <div key={hex} className="group relative">
            <button
              type="button"
              aria-label={hex}
              onClick={() => onColorChange(tag, hex)}
              className={cn(
                "size-5 rounded-full border-2 transition-transform hover:scale-110",
                isCustomHex && colorOverride === hex && "ring-2 ring-offset-1",
              )}
              style={{
                backgroundColor: hex,
                borderColor: `${hex}cc`,
                ["--tw-ring-color" as string]: hex,
              }}
            />
            <button
              type="button"
              aria-label={t("deleteColor")}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCustomColor(hex);
              }}
              className="absolute -top-1 -right-1 hidden size-3.5 items-center justify-center rounded-full border border-border bg-card-background text-text-secondary group-hover:flex"
            >
              <XIcon className="size-2" />
            </button>
          </div>
        ))}

        {/* Add custom color */}
        {addingColor ? (
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <button
              type="button"
              aria-label={t("addColor")}
              onClick={() => {
                onAddCustomColor(newColorHex);
                onColorChange(tag, newColorHex);
                setAddingColor(false);
              }}
              className="flex size-5 items-center justify-center rounded border border-border text-text-secondary hover:text-text-primary"
            >
              <CheckIcon className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setAddingColor(false)}
              className="flex size-5 items-center justify-center rounded text-text-tertiary hover:text-text-primary"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={t("addColor")}
            onClick={() => setAddingColor(true)}
            className="flex size-5 items-center justify-center rounded-full border-2 border-border border-dashed text-text-tertiary transition-colors hover:border-text-tertiary hover:text-text-primary"
          >
            <PlusIcon className="size-3" />
          </button>
        )}
      </div>

      {/* Reset to auto */}
      {hasOverride && (
        <div className="border-border border-t pt-1">
          <button
            type="button"
            onClick={() => onColorChange(tag, null)}
            className="text-[11px] text-text-tertiary transition-colors hover:text-text-primary"
          >
            {t("colorReset")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings tab — Triggers card + Agent Instruction card
// ─────────────────────────────────────────────────────────────────────────────

function SettingsTab({
  draft,
  setDraft,
  agents,
  defaultAgentId,
  promptError,
  onPromptInput,
  t,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  agents: AgentPreset[];
  defaultAgentId?: string;
  promptError: boolean;
  onPromptInput: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  // The guided tour's "fill this in for me" arrow can't reach a trigger the way
  // it reaches a text field — a schedule is state, not a DOM value. So it fires
  // TOUR_APPLY_EVENT at the ringed section and the shape stays here, where it's
  // owned. Keep in step with the suggestion the tour prints
  // (`tour.spotlight.patrolTrigger.exampleValue`).
  const tourApplyCleanup = useRef<(() => void) | null>(null);
  const setTourNode = useCallback(
    (node: HTMLElement | null) => {
      tourApplyCleanup.current?.();
      tourApplyCleanup.current = null;
      if (!node) return;
      const onApply = () => setDraft((d) => (d ? { ...d, schedule: { type: "weekly", days: [5], time: "17:00" } } : d));
      node.addEventListener(TOUR_APPLY_EVENT, onApply);
      tourApplyCleanup.current = () => node.removeEventListener(TOUR_APPLY_EVENT, onApply);
    },
    [setDraft],
  );

  return (
    <div className="flex flex-col gap-7">
      {/* Triggers */}
      {/* data-tour: spotlight-tour anchor — see lib/tour-steps.ts. */}
      <section className="flex flex-col gap-2.5" data-tour="patrol-trigger" ref={setTourNode}>
        <span className="px-2 text-[12px] text-text-secondary">{t("triggers")}</span>
        <TriggersCard
          schedule={draft.schedule}
          eventTrigger={draft.eventTrigger}
          onChangeSchedule={(schedule) => setDraft((d) => (d ? { ...d, schedule, eventTrigger: null } : d))}
          onChangeEventTrigger={(eventTrigger) =>
            setDraft((d) => (d ? { ...d, eventTrigger, schedule: d.schedule ?? defaultScheduleKind("cron") } : d))
          }
          onRemove={() => setDraft((d) => (d ? { ...d, schedule: null, eventTrigger: null } : d))}
          t={t}
        />
      </section>

      {/* Actions — post-run side effects dispatched to a connector once this
          patrol's card finishes. */}
      <section className="flex flex-col gap-2.5">
        <span className="px-2 text-[12px] text-text-secondary">{t("actionsSection.title")}</span>
        <ActionsCard
          actions={draft.actions}
          onChange={(actions) => setDraft((d) => (d ? { ...d, actions } : d))}
          t={t}
        />
      </section>

      {/* Agent Instruction */}
      <section className="flex flex-col gap-2.5">
        <span className="px-2 text-[12px] text-text-secondary">{t("agentInstruction")}</span>
        <div
          className={cn(
            "flex flex-col gap-4 rounded-xl border bg-card-background p-4 transition-colors",
            promptError ? "border-destructive" : "border-border-cards",
          )}
        >
          <Textarea
            id="agent-instruction-input"
            value={draft.agentPrompt}
            onChange={(e) => {
              onPromptInput();
              setDraft((d) => (d ? { ...d, agentPrompt: e.target.value } : d));
            }}
            spellCheck={false}
            // Spotlight-tour anchor — see lib/tour-steps.ts.
            data-tour="patrol-instruction"
            className="min-h-[182px] resize-y border-0 bg-transparent p-0 text-[12px] text-text-primary shadow-none focus-visible:ring-0 dark:bg-transparent"
            placeholder={t("instructionPlaceholder")}
          />
          <div className="border-border border-t pt-4" data-tour="patrol-agent">
            <AgentPresetSection
              draft={draft}
              setDraft={setDraft}
              agents={agents}
              defaultAgentId={defaultAgentId}
              t={t}
            />
          </div>
        </div>
        {promptError && <span className="px-2 text-[11px] text-destructive">{t("toast.needPrompt")}</span>}
      </section>
    </div>
  );
}

/**
 * True when the schedule's agent config diverges from the selected preset's
 * defaults — i.e. a preset *with overrides*. The per-schedule `--branch=` token
 * isn't a preset setting, so it's excluded from the comparison.
 */
function isPresetOverridden(draft: Draft, preset: AgentPreset): boolean {
  const stripBranch = (f: string[]) => f.filter((tok) => tok !== "--branch" && !tok.startsWith("--branch="));
  const presetFlags = stripBranch(preset.flags ?? []).sort();
  // Empty non-branch flags = inherit the preset (the branch token isn't an override).
  const draftFlags = stripBranch(draft.agentFlags);
  const effectiveFlags = (draftFlags.length ? draftFlags : presetFlags).slice().sort();
  const flagsDiff = JSON.stringify(effectiveFlags) !== JSON.stringify(presetFlags);
  const worktreeDiff = (draft.useWorktree ?? preset.useWorktree ?? false) !== (preset.useWorktree ?? false);
  const launchDiff = (draft.launchVia ?? preset.launchVia ?? "direct") !== (preset.launchVia ?? "direct");
  const ollamaDiff = (draft.ollamaModel ?? preset.ollamaModel ?? "") !== (preset.ollamaModel ?? "");
  return flagsDiff || worktreeDiff || launchDiff || ollamaDiff;
}

/** Agent preset selector + collapsible per-run override (worktree, skip-permissions,
 *  model, effort, all options) — same capability as the old schedule modal. */
function AgentPresetSection({
  draft,
  setDraft,
  agents,
  defaultAgentId,
  t,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  agents: AgentPreset[];
  defaultAgentId?: string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (agents.length === 0) return null;
  // biome-ignore lint/nursery/useNullishCoalescing: empty string must fall through to the next default.
  const presetId = draft.agentPresetId || defaultAgentId || agents[0]?.id || "";
  const selected = agents.find((p) => p.id === presetId);
  const overridden = selected ? isPresetOverridden(draft, selected) : false;

  // The branch token rides inside agentFlags but isn't a preset override. When the
  // schedule has no real flag override, feed AgentOptions the preset's defaults (so
  // they display as inherited) plus the branch chip.
  const isBranchTok = (tok: string) => tok === "--branch" || tok.startsWith("--branch=");
  const branchTokens = draft.agentFlags.filter(isBranchTok);
  const draftNonBranch = draft.agentFlags.filter((tok) => !isBranchTok(tok));
  const optionFlags = draftNonBranch.length ? draft.agentFlags : [...(selected?.flags ?? []), ...branchTokens];

  // Reset overrides → inherit the preset again (keep the branch selection).
  const resetOverrides = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            agentFlags: d.agentFlags.filter(isBranchTok),
            useWorktree: undefined,
            launchVia: undefined,
            ollamaModel: undefined,
          }
        : d,
    );

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[12px] text-text-secondary">
        {t("agentPreset")}
        {overridden && (
          <>
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-[9px] text-amber-600">
              {t("overridden")}
            </span>
            <button
              type="button"
              onClick={resetOverrides}
              className="inline-flex items-center gap-1 text-[11px] text-text-tertiary transition-colors hover:text-text-primary"
            >
              <RotateCcwIcon className="size-3" />
              {t("resetOverrides")}
            </button>
          </>
        )}
      </span>
      <Select value={presetId} onValueChange={(v) => setDraft((d) => (d ? { ...d, agentPresetId: v } : d))}>
        <SelectTrigger className="h-9 w-full max-w-xs text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {agents.map((p) => {
            const r = loadTestResult(p.id);
            return (
              <SelectItem key={p.id} value={p.id} className="text-[13px]">
                <span className="flex items-center gap-2">
                  {p.name}
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium text-[9px]",
                      r?.status === "passed"
                        ? "bg-green-500/15 text-green-600"
                        : r?.status === "failed"
                          ? "bg-red-500/15 text-red-600"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {r?.status === "passed" ? (
                      <CheckCircle2Icon className="size-2.5" />
                    ) : r?.status === "failed" ? (
                      <XCircleIcon className="size-2.5" />
                    ) : null}
                    {r?.status === "passed" ? t("tested") : r?.status === "failed" ? t("testFailed") : t("untested")}
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {selected && (
        <details className="group rounded-md border border-border-cards bg-card-background-secondary px-2.5 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-[12px] text-text-secondary hover:text-text-primary">
            <ChevronRightIcon className="size-3 transition-transform group-open:rotate-90" />
            {t("override")}
            {overridden && <span className="size-1.5 rounded-full bg-amber-500" title={t("overridden")} />}
          </summary>
          <div className="pt-2">
            <AgentOptions
              binary={selected.binary}
              flags={optionFlags}
              useWorktree={draft.useWorktree ?? selected.useWorktree ?? false}
              launchVia={draft.launchVia ?? selected.launchVia ?? "direct"}
              ollamaModel={draft.ollamaModel ?? selected.ollamaModel ?? ""}
              onFlagsChange={(flags) => setDraft((d) => (d ? { ...d, agentFlags: flags } : d))}
              onWorktreeChange={(v) => setDraft((d) => (d ? { ...d, useWorktree: v } : d))}
              onLaunchViaChange={(v) => setDraft((d) => (d ? { ...d, launchVia: v } : d))}
              onOllamaModelChange={(v) => setDraft((d) => (d ? { ...d, ollamaModel: v } : d))}
            />
          </div>
        </details>
      )}
    </div>
  );
}

// ── Folder & branch selectors (next to the status toggle) ────────────────────

// No GitHub connection yet → we don't list remote repos. Instead the user picks
// one or more local folders to work on (OS folder picker). The schedule backend
// stores a single workingDir, so the *primary* (first) folder is persisted there;
// the full multi-folder selection is remembered per schedule in localStorage.
const RECENT_FOLDERS_KEY = "myra:scheduleEdit:recentFolders";
const folderListKey = (scheduleId: string) => `myra:scheduleEdit:folders:${scheduleId}`;
// Per-folder branch overrides ({ folderPath → branch }), app-local. The *primary*
// folder's branch also mirrors to agentFlags `--branch=` (the only one persisted
// server-side); extra folders' branches live here only.
const branchMapKey = (scheduleId: string) => `myra:scheduleEdit:branches:${scheduleId}`;

function readBranchMap(scheduleId: string): Record<string, string> {
  try {
    const raw = getLocalStorageValue(branchMapKey(scheduleId));
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

const GLOBAL_TAG_COLOR_KEY = "myra:tagColors:byTag";

function readGlobalTagColorMap(): Record<string, number | string> {
  try {
    const raw = getLocalStorageValue(GLOBAL_TAG_COLOR_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeGlobalTagColorMap(map: Record<string, number | string>): void {
  setLocalStorageValue(GLOBAL_TAG_COLOR_KEY, JSON.stringify(map));
}

const CUSTOM_PALETTE_KEY = "myra:tagColors:customPalette";

function readCustomPalette(): string[] {
  try {
    const raw = getLocalStorageValue(CUSTOM_PALETTE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeCustomPalette(palette: string[]): void {
  setLocalStorageValue(CUSTOM_PALETTE_KEY, JSON.stringify(palette));
}

/** Last path segment — the short repo/folder name shown on the trigger button. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function readRecents(key: string): string[] {
  try {
    const raw = getLocalStorageValue(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(key: string, value: string) {
  const v = value.trim();
  if (!v) return;
  const next = [v, ...readRecents(key).filter((x) => x !== v)].slice(0, 5);
  setLocalStorageValue(key, JSON.stringify(next));
}

/**
 * Local-folder picker (no GitHub repo listing). The user picks one or more
 * folders to work on; the primary (first) folder is saved as the schedule's
 * workingDir, the rest are remembered per schedule. Toggling keeps the menu open.
 */
function FolderSelect({
  scheduleId,
  ephemeral,
  value,
  invalid,
  homeFolder,
  onChange,
  onFoldersChange,
  t,
}: {
  scheduleId: string;
  /** Template/blank draft: don't seed from or persist the per-schedule list. */
  ephemeral?: boolean;
  value: string;
  /** Highlight the trigger as a required-but-empty field. */
  invalid?: boolean;
  /** Configurable base folder (Settings); its subfolders are offered as options. */
  homeFolder: string;
  onChange: (primary: string) => void;
  /** Report the full selected-folder list up (so the branch picker can show one per folder). */
  onFoldersChange?: (folders: string[]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [subfolders, setSubfolders] = useState<string[]>([]);

  // Seed once on mount: the per-schedule folder list, falling back to the saved
  // workingDir; plus the global "recently used folders" list.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    // Ephemeral drafts ignore any persisted list so each New/Template starts empty.
    const stored = ephemeral ? [] : readRecents(folderListKey(scheduleId));
    const initial = stored.length ? stored : value ? [value] : [];
    setFolders(initial);
    onFoldersChange?.(initial);
    setRecents(readRecents(RECENT_FOLDERS_KEY));
  }, [scheduleId, ephemeral, value, onFoldersChange]);

  // List the home folder's immediate subdirectories (desktop only) when opened.
  const loadSubfolders = useCallback(async () => {
    if (!isTauri() || !homeFolder.trim()) {
      setSubfolders([]);
      return;
    }
    try {
      setSubfolders(await tauriInvoke<string[]>("list_subfolders", { path: homeFolder.trim() }));
    } catch (e) {
      console.warn("list_subfolders failed", e);
      setSubfolders([]);
    }
  }, [homeFolder]);

  // Persist the selection and surface the primary folder to the schedule.
  const commit = (next: string[]) => {
    setFolders(next);
    // Don't persist ephemeral (template/blank) selections — they'd carry over.
    if (!ephemeral) setLocalStorageValue(folderListKey(scheduleId), JSON.stringify(next));
    onChange(next[0] ?? "");
    onFoldersChange?.(next);
  };

  const toggle = (path: string) => {
    if (folders.includes(path)) {
      commit(folders.filter((f) => f !== path));
    } else {
      commit([...folders, path]);
      pushRecent(RECENT_FOLDERS_KEY, path);
      setRecents(readRecents(RECENT_FOLDERS_KEY));
    }
  };

  const addPicked = (paths: string[]) => {
    const clean = paths.map((p) => p.trim()).filter(Boolean);
    if (!clean.length) return;
    for (const p of clean) pushRecent(RECENT_FOLDERS_KEY, p);
    setRecents(readRecents(RECENT_FOLDERS_KEY));
    commit([...new Set([...folders, ...clean])]);
  };

  const addFolders = async () => {
    // Desktop app: native OS folder browser (absolute paths, multi-select).
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: true, title: t("addFolders") });
        addPicked(Array.isArray(selected) ? selected : selected ? [selected] : []);
      } catch {
        /* dialog unavailable */
      }
      return;
    }
    // Browser: the File System Access API directory chooser (Chromium). Web pages
    // only get the folder *name* (the OS hides absolute paths); the desktop build
    // uses the Tauri picker above for real paths.
    const pickDir = (
      window as unknown as {
        showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<{ name: string }>;
      }
    ).showDirectoryPicker;
    if (typeof pickDir === "function") {
      try {
        const handle = await pickDir({ mode: "read" });
        if (handle?.name) addPicked([handle.name]);
      } catch {
        /* user dismissed the picker */
      }
      return;
    }
    // Last resort (browsers without the API, e.g. Firefox): type a path.
    const typed = window.prompt(t("addFolders"));
    if (typed) addPicked([typed]);
  };

  const home = homeFolder.trim();

  const label =
    folders.length === 0
      ? t("selectFolder")
      : folders.length === 1
        ? folders[0] === home
          ? t("home")
          : baseName(folders[0])
        : `${baseName(folders[0])} +${folders.length - 1}`;
  const q = query.trim().toLowerCase();
  // Subfolders of home + recents + already-selected, minus the home folder itself
  // (it has its own row), filtered by the query.
  const known = [...new Set([...subfolders, ...folders, ...recents])]
    .filter((r) => r !== home)
    .filter((r) => !folders.includes(r))
    .filter((r) => !q || r.toLowerCase().includes(q));

  return (
    <DropdownMenu onOpenChange={(open) => open && void loadSubfolders()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 text-[12px]",
            invalid
              ? "font-medium text-destructive hover:text-destructive"
              : "text-text-secondary hover:text-text-primary",
          )}
          title={folders.join("\n")}
        >
          {invalid && <TriangleAlertIcon className="size-3" />}
          {label}
          <ChevronDownIcon className="size-3.5 text-icon-tertiary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0">
        <div className="border-border border-b p-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchFolders")}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8 border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {folders.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[11px] text-text-tertiary">{t("selected")}</DropdownMenuLabel>
              {folders.map((f) => (
                <DropdownMenuItem
                  key={`sel-${f}`}
                  className="gap-2 text-[13px]"
                  title={f}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggle(f);
                  }}
                >
                  {f === home ? (
                    <HomeIcon className="size-4 text-icon-secondary" />
                  ) : (
                    <FolderIcon className="size-4 text-icon-secondary" />
                  )}
                  <span className="truncate">{f === home ? t("home") : baseName(f)}</span>
                  <CheckIcon className="ml-auto size-3.5 text-icon-secondary" />
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="my-1" />
            </>
          )}
          {home &&
            !folders.includes(home) &&
            (!q || t("home").toLowerCase().includes(q) || baseName(home).toLowerCase().includes(q)) && (
              <DropdownMenuItem
                className="gap-2 text-[13px]"
                title={home}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(home);
                }}
              >
                <HomeIcon className="size-4 text-icon-secondary" />
                <span className="truncate">{t("home")}</span>
              </DropdownMenuItem>
            )}
          <DropdownMenuLabel className="text-[11px] text-text-tertiary">{t("folders")}</DropdownMenuLabel>
          {known.length === 0 && <p className="px-2 py-1 text-[12px] text-text-tertiary">{t("noFoldersYet")}</p>}
          {known.map((f) => (
            <DropdownMenuItem
              key={f}
              className="gap-2 text-[13px]"
              title={f}
              onSelect={(e) => {
                e.preventDefault();
                toggle(f);
              }}
            >
              <FolderIcon className="size-4 text-icon-secondary" />
              <span className="truncate">{baseName(f)}</span>
              {folders.includes(f) && <CheckIcon className="ml-auto size-3.5 text-icon-secondary" />}
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem
            className="gap-2 text-[13px]"
            onSelect={(e) => {
              e.preventDefault();
              void addFolders();
            }}
          >
            <PlusIcon className="size-4 text-icon-secondary" />
            {t("addFolders")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-[13px]"
            onSelect={(e) => {
              e.preventDefault();
              setRecents(readRecents(RECENT_FOLDERS_KEY));
              void loadSubfolders();
            }}
          >
            <RefreshCwIcon className="size-4 text-icon-secondary" />
            {t("refresh")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GitBranches = { isGit: boolean; current: string | null; local: string[]; remote: string[] };

/**
 * Branch picker. When the selected folder is a git work tree (desktop only), it
 * shows the checked-out branch and lets the user pick any local or remote
 * (origin/…) branch. Otherwise it degrades to "main" + recents + type-to-set.
 */
function BranchSelect({
  value,
  repoPath,
  onChange,
  t,
}: {
  value: string;
  repoPath: string;
  onChange: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [query, setQuery] = useState("");
  const [git, setGit] = useState<GitBranches | null>(null);
  // Whether the git probe for the current folder has resolved — lets us grey the
  // picker out for non-git folders without flashing during the async check.
  const [checked, setChecked] = useState(false);

  // Re-read git branches each time the menu opens (folder may have changed).
  const loadGit = useCallback(async () => {
    if (!isTauri() || !repoPath.trim()) {
      setGit(null);
      setChecked(true);
      return;
    }
    try {
      // Tauri shell command (runs git on the host) — not a sidecar/board command,
      // so it must go through the core invoke, not the connection transport.
      const data = await tauriInvoke<GitBranches>("git_branches", { path: repoPath.trim() });
      setGit(data.isGit ? data : null);
    } catch (e) {
      console.warn("git_branches failed", e);
      setGit(null);
    } finally {
      setChecked(true);
    }
  }, [repoPath]);

  // Probe git-ness up front (and whenever the folder changes) so the picker can
  // grey out for non-git / unselected folders without being opened first.
  useEffect(() => {
    setChecked(false);
    setGit(null);
    void loadGit();
  }, [loadGit]);

  const pick = (v: string) => {
    onChange(v);
    setQuery("");
  };

  // git mode: create the typed branch (from HEAD), then select it.
  const createBranch = async (name: string) => {
    if (!isTauri() || !repoPath.trim()) return;
    try {
      await tauriInvoke("git_create_branch", { path: repoPath.trim(), name });
      await loadGit();
      pick(name);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const q = query.trim();
  const ql = q.toLowerCase();
  // Effective branch shown on the button: explicit choice → git HEAD → main.
  const effective = value || git?.current || "main";
  const match = (b: string) => !ql || b.toLowerCase().includes(ql);

  // Grey the picker out when there's no folder yet, while the async git probe is
  // still in flight, or when the folder isn't a git work tree — the picker only
  // becomes selectable once the branch listing has resolved.
  const noFolder = !repoPath.trim();
  const loading = !noFolder && !checked;
  const disabled = noFolder || loading || (checked && !git);

  const local = (git?.local ?? []).filter(match);
  const remote = (git?.remote ?? []).filter(match);
  // Non-git fallback: never persist typed branches — only surface the one that is
  // currently selected (so it shows as picked), nothing more.
  const selectedExtra = value && value !== "main" && match(value) ? [value] : [];
  const known = git ? [git.current ?? "", ...local, ...remote] : ["main", ...selectedExtra];
  const showCustom = q && !known.includes(q);

  return (
    <DropdownMenu onOpenChange={(open) => open && void loadGit()}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          title={
            noFolder ? t("branchNeedsFolder") : loading ? t("branchLoading") : disabled ? t("branchNotGit") : undefined
          }
          className={cn(
            "flex items-center gap-1 text-[12px]",
            disabled
              ? "cursor-not-allowed text-text-tertiary opacity-60"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          <GitBranchIcon className="size-3 text-icon-tertiary" />
          {loading ? t("branchLoading") : effective}
          <ChevronDownIcon className="size-3.5 text-icon-tertiary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0">
        <div className="border-border border-b p-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchBranches")}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8 border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {git ? (
            <>
              {git.current && match(git.current) && (
                <>
                  <DropdownMenuLabel className="text-[11px] text-text-tertiary">{t("branchCurrent")}</DropdownMenuLabel>
                  <BranchItem name={git.current} selected={effective === git.current} onPick={pick} />
                </>
              )}
              {local.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-[11px] text-text-tertiary">{t("branchLocal")}</DropdownMenuLabel>
                  {local.map((b) => (
                    <BranchItem key={`l-${b}`} name={b} selected={value === b} onPick={pick} />
                  ))}
                </>
              )}
              {remote.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-[11px] text-text-tertiary">{t("branchOrigin")}</DropdownMenuLabel>
                  {remote.map((b) => (
                    <BranchItem key={`r-${b}`} name={b} selected={value === b} onPick={pick} />
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <DropdownMenuLabel className="text-[11px] text-text-tertiary">{t("branchDefault")}</DropdownMenuLabel>
              <BranchItem name="main" selected={!value || value === "main"} onPick={pick} />
              {selectedExtra.length > 0 && (
                <DropdownMenuLabel className="text-[11px] text-text-tertiary">{t("branches")}</DropdownMenuLabel>
              )}
              {selectedExtra.map((b) => (
                <BranchItem key={b} name={b} selected={value === b} onPick={pick} />
              ))}
            </>
          )}
          {showCustom &&
            (git ? (
              // git repo → create the branch for real, then select it.
              <DropdownMenuItem className="gap-2 text-[13px]" onSelect={() => void createBranch(q)}>
                <GitBranchIcon className="size-4 text-icon-secondary" />
                {t("createBranch", { branch: q })}
              </DropdownMenuItem>
            ) : (
              // No git source → just set the typed name.
              <DropdownMenuItem className="gap-2 text-[13px]" onSelect={() => pick(q)}>
                {t("useBranch", { branch: q })}
              </DropdownMenuItem>
            ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BranchItem({ name, selected, onPick }: { name: string; selected: boolean; onPick: (v: string) => void }) {
  return (
    <DropdownMenuItem className={cn("gap-2 text-[13px]", selected && "bg-muted/40")} onSelect={() => onPick(name)}>
      <span className="truncate">{name}</span>
      {selected && <CheckIcon className="ml-auto size-3.5 text-icon-secondary" />}
    </DropdownMenuItem>
  );
}

/** When 2+ folders are selected: a popover with one branch picker per folder. */
function MultiBranchSelect({
  folders,
  branchOf,
  onChange,
  t,
}: {
  folders: string[];
  branchOf: (folder: string, isPrimary: boolean) => string;
  onChange: (folder: string, branch: string, isPrimary: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary"
        >
          {t("branchesCount", { count: folders.length })}
          <ChevronDownIcon className="size-3.5 text-icon-tertiary" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2 p-2">
        <p className="px-1 text-[11px] text-text-tertiary">{t("branchPerFolder")}</p>
        {folders.map((f, i) => (
          <div
            key={f}
            className="flex items-center justify-between gap-3 border-border border-b pb-2 last:border-b-0 last:pb-0"
          >
            <span className="truncate text-[12px] text-text-secondary" title={f}>
              {baseName(f)}
              {i === 0 && <span className="ml-1 text-[10px] text-text-tertiary">({t("primary")})</span>}
            </span>
            <BranchSelect value={branchOf(f, i === 0)} repoPath={f} onChange={(v) => onChange(f, v, i === 0)} t={t} />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ── Triggers card ────────────────────────────────────────────────────────────
// A list of trigger rows + an always-present "Add Trigger" row. With no rows the
// card shows only "Add Trigger" (empty state). The backend models a single
// cron-style schedule, so today there is exactly one schedule trigger row;
// clicking a row edits it, "Add Trigger" picks/replaces the schedule kind.

/** Friendlier wording than describeSchedule for the common cadences. */
function triggerLabel(kind: ScheduledTask["schedule"]): string {
  if (kind.type === "interval" && kind.minutes % 60 === 0) {
    const h = kind.minutes / 60;
    return h === 1 ? "Every hour" : `Every ${h} hours`;
  }
  return describeSchedule(kind);
}

function TriggersCard({
  schedule,
  eventTrigger,
  onChangeSchedule,
  onChangeEventTrigger,
  onRemove,
  t,
}: {
  schedule: ScheduledTask["schedule"] | null;
  eventTrigger: EventTrigger | null;
  onChangeSchedule: (s: ScheduledTask["schedule"]) => void;
  onChangeEventTrigger: (e: EventTrigger) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const plugins = usePluginCatalog();
  const hasTrigger = schedule !== null || eventTrigger !== null;
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border-cards bg-card-background">
      {eventTrigger ? (
        <EventTriggerRow
          value={eventTrigger}
          plugin={plugins.find((p) => p.name === eventTrigger.connector)}
          onChange={onChangeEventTrigger}
          onRemove={onRemove}
          t={t}
        />
      ) : (
        schedule && <TriggerRow value={schedule} onChange={onChangeSchedule} onRemove={onRemove} t={t} />
      )}
      {/* Only one trigger (schedule or event) is supported → tell the menu to disable the rest. */}
      <AddTriggerMenu
        onPickSchedule={onChangeSchedule}
        onPickEvent={onChangeEventTrigger}
        hasTrigger={hasTrigger}
        plugins={plugins}
        t={t}
      />
    </div>
  );
}

/** One trigger row — click to edit; trash icon on hover removes it. */
function TriggerRow({
  value,
  onChange,
  onRemove,
  t,
}: {
  value: ScheduledTask["schedule"];
  onChange: (s: ScheduledTask["schedule"]) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="group relative flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center gap-3 py-3.5 pr-12 pl-4 text-left transition-colors hover:bg-muted/20"
          >
            <ClockIcon className="size-[18px] shrink-0 text-icon-secondary" />
            <span className="text-[14px] text-text-primary">{triggerLabel(value)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-72 flex-col gap-3">
          <ScheduleKindFields value={value} onChange={onChange} t={t} />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={t("removeTrigger")}
        onClick={onRemove}
        className="absolute right-3 flex size-7 items-center justify-center rounded-md text-icon-tertiary opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  );
}

/**
 * Installed plugins declaring `catalog` verbs — shared by the trigger and
 * action pickers (and the trigger row's connector name lookup). Fetched once
 * per mount; the editor is a short-lived page so no live-refresh subscription.
 */
function usePluginCatalog(): PluginInfo[] {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    const id = connectionManager.primaryId();
    connectionManager
      .invokeOne<PluginInfo[]>(id, "list_plugins")
      .then((list) => {
        if (!cancelled) setPlugins(list);
      })
      .catch(() => {
        if (!cancelled) setPlugins([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return plugins;
}

/** One event-trigger row — click to edit its rule; trash icon on hover removes it. */
function EventTriggerRow({
  value,
  plugin,
  onChange,
  onRemove,
  t,
}: {
  value: EventTrigger;
  plugin: PluginInfo | undefined;
  onChange: (e: EventTrigger) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const rule = value.rules[0] ?? {};
  const parts = [rule.from, rule.subjectContains, rule.bodyContains, rule.regex].filter(Boolean);
  const summary =
    parts.length > 0 ? t("eventTrigger.matches", { summary: parts.join(" · ") }) : t("eventTrigger.anyEvent");
  const name = plugin?.catalog?.name ?? value.connector;
  const setRule = (patch: Partial<ConnectorRule>) => onChange({ ...value, rules: [{ ...rule, ...patch }] });

  return (
    <div className="group relative flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center gap-3 py-3.5 pr-12 pl-4 text-left transition-colors hover:bg-muted/20"
          >
            <GitBranchIcon className="size-[18px] shrink-0 text-icon-secondary" />
            <div className="flex flex-col">
              <span className="text-[14px] text-text-primary">{name}</span>
              <span className="text-[12px] text-text-tertiary">{summary}</span>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">{t("eventTrigger.from")}</span>
            <Input
              value={rule.from ?? ""}
              onChange={(e) => setRule({ from: e.target.value || undefined })}
              className="h-8 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">{t("eventTrigger.subjectContains")}</span>
            <Input
              value={rule.subjectContains ?? ""}
              onChange={(e) => setRule({ subjectContains: e.target.value || undefined })}
              className="h-8 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">{t("eventTrigger.bodyContains")}</span>
            <Input
              value={rule.bodyContains ?? ""}
              onChange={(e) => setRule({ bodyContains: e.target.value || undefined })}
              className="h-8 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">{t("eventTrigger.regex")}</span>
            <Input
              value={rule.regex ?? ""}
              onChange={(e) => setRule({ regex: e.target.value || undefined })}
              className="h-8 font-mono text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-text-secondary">{t("eventTrigger.prompt")}</span>
            <Textarea
              value={rule.prompt ?? ""}
              onChange={(e) => setRule({ prompt: e.target.value || undefined })}
              placeholder={t("eventTrigger.promptPlaceholder")}
              className="min-h-16 text-[13px]"
            />
            <span className="text-[11px] text-text-tertiary">{t("eventTrigger.promptHint")}</span>
          </div>
          <label className="flex items-center justify-between gap-2 text-[13px]">
            {t("eventTrigger.requireReview")}
            <Switch checked={rule.requireReview ?? false} onCheckedChange={(c) => setRule({ requireReview: c })} />
          </label>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={t("removeTrigger")}
        onClick={onRemove}
        className="absolute right-3 flex size-7 items-center justify-center rounded-md text-icon-tertiary opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  );
}

/** "+ Add Trigger" row → dropdown with a search box, the scheduled options,
 * and every installed connector plugin whose `catalog.verbs` includes
 * `"trigger"`. Only one trigger (of either kind) is supported at a time. */
function AddTriggerMenu({
  onPickSchedule,
  onPickEvent,
  hasTrigger,
  plugins,
  t,
}: {
  onPickSchedule: (s: ScheduledTask["schedule"]) => void;
  onPickEvent: (e: EventTrigger) => void;
  hasTrigger: boolean;
  plugins: PluginInfo[];
  t: ReturnType<typeof useTranslations>;
}) {
  const [query, setQuery] = useState("");

  const scheduled: { key: "hourly" | "daily" | "weekly" | "custom"; make: () => ScheduledTask["schedule"] }[] = [
    { key: "hourly", make: () => ({ type: "interval", start: "09:00", minutes: 60 }) },
    { key: "daily", make: () => defaultScheduleKind("daily") },
    { key: "weekly", make: () => defaultScheduleKind("weekly") },
    { key: "custom", make: () => defaultScheduleKind("cron") },
  ];

  const triggerPlugins = useMemo(() => plugins.filter((p) => p.catalog?.verbs?.includes("trigger")), [plugins]);

  const q = query.trim().toLowerCase();
  const showScheduled = !q || t("categories.scheduled").toLowerCase().includes(q);
  const visibleConnectors = triggerPlugins.filter(
    (p) => !q || (p.catalog?.name ?? p.name).toLowerCase().includes(q),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-text-secondary transition-colors hover:bg-muted/20 hover:text-text-primary"
        >
          <PlusIcon className="size-[18px] shrink-0" />
          <span className="text-[14px]">{t("addTrigger")}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0">
        <div className="border-border border-b p-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchTriggers")}
            // Let the dropdown's typeahead ignore keystrokes meant for the box.
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8 border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="p-1">
          {showScheduled &&
            (hasTrigger ? (
              // A trigger already exists — only one is supported, so the
              // category is disabled with a tooltip explaining why.
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    aria-disabled
                    className="flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-text-tertiary opacity-60"
                  >
                    <ClockIcon className="size-4 text-icon-tertiary" />
                    {t("categories.scheduled")}
                    <ChevronRightIcon className="ml-auto size-4 text-icon-tertiary" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{t("oneScheduledOnly")}</TooltipContent>
              </Tooltip>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 text-[13px]">
                  <ClockIcon className="size-4 text-icon-secondary" />
                  {t("categories.scheduled")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {scheduled.map((s) => (
                    <DropdownMenuItem key={s.key} className="text-[13px]" onSelect={() => onPickSchedule(s.make())}>
                      {t(`scheduledOptions.${s.key}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          {visibleConnectors.map((p) => {
            const name = p.catalog?.name ?? p.name;
            if (hasTrigger) {
              return (
                <Tooltip key={p.name}>
                  <TooltipTrigger asChild>
                    <div
                      aria-disabled
                      className="flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-text-tertiary opacity-60"
                    >
                      <GitBranchIcon className="size-4 text-icon-tertiary" />
                      {name}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t("oneScheduledOnly")}</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <DropdownMenuItem
                key={p.name}
                className="gap-2 text-[13px]"
                onSelect={() => onPickEvent({ connector: p.name, rules: [{}] })}
              >
                <GitBranchIcon className="size-4 text-icon-secondary" />
                {name}
              </DropdownMenuItem>
            );
          })}
          {triggerPlugins.length === 0 && (
            <p className="px-2 py-1.5 text-[13px] text-text-tertiary">{t("noConnectors")}</p>
          )}
          {!showScheduled && triggerPlugins.length > 0 && visibleConnectors.length === 0 && (
            <p className="px-2 py-1.5 text-[13px] text-text-tertiary">{t("noTriggers")}</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Actions card — post-run side effects dispatched to a connector when this
 * patrol's card finishes. Same row/popover/add-menu shape as Triggers, but a
 * plain list (not capped at one) since a patrol can run several actions. */
function ActionsCard({
  actions,
  onChange,
  t,
}: {
  actions: PatrolAction[];
  onChange: (a: PatrolAction[]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const plugins = usePluginCatalog();
  const actionPlugins = useMemo(() => plugins.filter((p) => (p.catalog?.actions?.length ?? 0) > 0), [plugins]);

  const updateAt = (i: number, next: PatrolAction) => onChange(actions.map((a, idx) => (idx === i ? next : a)));
  const removeAt = (i: number) => onChange(actions.filter((_, idx) => idx !== i));

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border-cards bg-card-background">
      {actions.map((action, i) => {
        const plugin = plugins.find((p) => p.name === action.connector);
        const def = plugin?.catalog?.actions?.find((a) => a.id === action.type);
        return (
          <ActionRow
            // biome-ignore lint/suspicious/noArrayIndexKey: positional action list, no stable id.
            key={i}
            action={action}
            label={def?.label ?? `${plugin?.catalog?.name ?? action.connector}: ${action.type}`}
            fields={def?.config ?? []}
            onChange={(next) => updateAt(i, next)}
            onRemove={() => removeAt(i)}
            t={t}
          />
        );
      })}
      <AddActionMenu plugins={actionPlugins} onPick={(a) => onChange([...actions, a])} t={t} />
    </div>
  );
}

function ActionRow({
  action,
  label,
  fields,
  onChange,
  onRemove,
  t,
}: {
  action: PatrolAction;
  label: string;
  fields: PluginCatalogAction["config"];
  onChange: (a: PatrolAction) => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const setConfig = (key: string, value: string) =>
    onChange({ ...action, config: { ...action.config, [key]: value } });
  return (
    <div className="group relative flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center gap-3 py-3.5 pr-12 pl-4 text-left transition-colors hover:bg-muted/20"
          >
            <PlayIcon className="size-[18px] shrink-0 text-icon-secondary" />
            <span className="text-[14px] text-text-primary">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 flex-col gap-3">
          {fields.length === 0 && <p className="text-[13px] text-text-tertiary">—</p>}
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <span className="text-[12px] text-text-secondary">
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
              </span>
              <Input
                value={String(action.config[f.key] ?? "")}
                placeholder={f.placeholder}
                onChange={(e) => setConfig(f.key, e.target.value)}
                className="h-8 text-[13px]"
              />
              {f.description && <span className="text-[11px] text-text-tertiary">{f.description}</span>}
            </div>
          ))}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={t("actionsSection.remove")}
        onClick={onRemove}
        className="absolute right-3 flex size-7 items-center justify-center rounded-md text-icon-tertiary opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  );
}

function AddActionMenu({
  plugins,
  onPick,
  t,
}: {
  plugins: PluginInfo[];
  onPick: (a: PatrolAction) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const entries = useMemo(
    () => plugins.flatMap((p) => (p.catalog?.actions ?? []).map((def) => ({ plugin: p, def }))),
    [plugins],
  );
  const visible = entries.filter(
    ({ plugin, def }) => !q || `${plugin.catalog?.name ?? plugin.name} ${def.label}`.toLowerCase().includes(q),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-text-secondary transition-colors hover:bg-muted/20 hover:text-text-primary"
        >
          <PlusIcon className="size-[18px] shrink-0" />
          <span className="text-[14px]">{t("actionsSection.addAction")}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0">
        <div className="border-border border-b p-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("actionsSection.searchActions")}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8 border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        <div className="p-1">
          {visible.map(({ plugin, def }) => (
            <DropdownMenuItem
              key={`${plugin.name}:${def.id}`}
              className="flex-col items-start gap-0.5 text-[13px]"
              onSelect={() => onPick({ connector: plugin.name, type: def.id, config: {} })}
            >
              <span>
                {plugin.catalog?.name ?? plugin.name} — {def.label}
              </span>
              {def.summary && <span className="text-[11px] text-text-tertiary">{def.summary}</span>}
            </DropdownMenuItem>
          ))}
          {visible.length === 0 && (
            <p className="px-2 py-1.5 text-[13px] text-text-tertiary">{t("actionsSection.noActions")}</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact schedule-kind editor (kind select + per-kind fields). */
function ScheduleKindFields({
  value,
  onChange,
  t,
}: {
  value: ScheduledTask["schedule"];
  onChange: (s: ScheduledTask["schedule"]) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const kinds: ScheduleKindType[] = ["once", "daily", "weekly", "interval", "cron"];
  return (
    <>
      <Select value={value.type} onValueChange={(v) => onChange(defaultScheduleKind(v as ScheduleKindType))}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {kinds.map((k) => (
            <SelectItem key={k} value={k} className="text-xs">
              {t(`kinds.${k}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.type === "daily" && (
        <LabeledTime label={t("time")} value={value.time} onChange={(time) => onChange({ ...value, time })} />
      )}
      {value.type === "weekly" && (
        <>
          <DaysPicker
            label={t("days")}
            selected={value.days}
            onToggle={(day) => {
              const next = value.days.includes(day)
                ? value.days.filter((d) => d !== day)
                : [...value.days, day].sort((a, b) => a - b);
              onChange({ ...value, days: next });
            }}
            t={t}
          />
          <LabeledTime label={t("time")} value={value.time} onChange={(time) => onChange({ ...value, time })} />
        </>
      )}
      {value.type === "once" && (
        <input
          type="datetime-local"
          value={value.at}
          onChange={(e) => onChange({ ...value, at: e.target.value })}
          className="h-8 rounded-md border border-border bg-transparent px-2 text-text-primary text-xs"
        />
      )}
      {value.type === "interval" && (
        <>
          <label className="flex items-center justify-between text-text-secondary text-xs">
            {t("everyMinutes")}
            <input
              type="number"
              min={1}
              value={value.minutes}
              onChange={(e) => onChange({ ...value, minutes: Number(e.target.value) || 1 })}
              className="h-8 w-20 rounded-md border border-border bg-transparent px-2 text-text-primary text-xs"
            />
          </label>
          <LabeledTime label={t("startTime")} value={value.start} onChange={(start) => onChange({ ...value, start })} />
        </>
      )}
      {value.type === "cron" && (
        <input
          value={value.expr}
          onChange={(e) => onChange({ ...value, expr: e.target.value })}
          placeholder="0 9 * * 1-5"
          className="h-8 rounded-md border border-border bg-transparent px-2 font-mono text-text-primary text-xs"
        />
      )}
      <p className="text-[11px] text-text-tertiary">{describeSchedule(value)}</p>
    </>
  );
}

/** Mon–Sun day toggles for the weekly schedule. Day numbers are 1=Mon … 7=Sun. */
function DaysPicker({
  label,
  selected,
  onToggle,
  t,
}: {
  label: string;
  selected: number[];
  onToggle: (day: number) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const days = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="flex items-center justify-between gap-2 text-text-secondary text-xs">
      {label}
      <div className="flex items-center gap-1">
        {days.map((day) => {
          const on = selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(day)}
              className={cn(
                "flex size-6 items-center justify-center rounded-md border text-[11px] transition-colors",
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-text-secondary hover:border-text-tertiary hover:text-text-primary",
              )}
            >
              {t(`weekdays.${day}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LabeledTime({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between text-text-secondary text-xs">
      {label}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-28 rounded-md border border-border bg-transparent px-2 text-text-primary text-xs"
      />
    </label>
  );
}
