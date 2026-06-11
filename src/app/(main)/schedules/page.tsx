"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockIcon,
  CoffeeIcon,
  CopyIcon,
  FlaskConicalIcon,
  FolderIcon,
  HelpCircleIcon,
  ListChecksIcon,
  ListPlusIcon,
  Loader2Icon,
  type LucideIcon,
  PackageIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  UsersIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AgentOptions } from "@/components/agents/agent-options";
import { WorkingDirField } from "@/components/agents/working-dir-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSchedules } from "@/hooks/use-schedules";
import { useSettings } from "@/hooks/use-settings";
import { loadTestResult, persistTestResult, type StoredTestResult } from "@/lib/agent-test-store";
import { normalizeTag, tagClassName } from "@/lib/kanban-tags";
import { cronToSchedule, scheduleToCron } from "@/lib/schedule-cron";
import { invoke } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type {
  CreateScheduleInput,
  ScheduledTask,
  ScheduleKind,
  ScheduleKindType,
  UpdateScheduleInput,
} from "@/types/schedule";
import { defaultScheduleKind, describeSchedule, formatHm } from "@/types/schedule";
import type { AgentPreset } from "@/types/settings";

interface SchedulePreset {
  id: string;
  icon: LucideIcon;
  schedule: ScheduleKind;
  tags: string[];
}

// Starter recurring tasks surfaced as "More ideas" chips. Clicking one opens the
// editor prefilled — labels/copy come from i18n (`schedules.ideas.<id>.*`).
const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: "dailyBrief", icon: CoffeeIcon, schedule: { type: "daily", time: "09:00" }, tags: ["brief"] },
  {
    id: "standupPrep",
    icon: UsersIcon,
    schedule: { type: "weekly", days: [1, 2, 3, 4, 5], time: "08:45" },
    tags: ["standup"],
  },
  {
    id: "weeklyReview",
    icon: ListChecksIcon,
    schedule: { type: "weekly", days: [1], time: "09:00" },
    tags: ["review"],
  },
  { id: "depUpdates", icon: PackageIcon, schedule: { type: "weekly", days: [1], time: "10:00" }, tags: ["deps"] },
  { id: "testSweep", icon: FlaskConicalIcon, schedule: { type: "daily", time: "08:00" }, tags: ["tests"] },
];

export default function SchedulesPage() {
  const t = useTranslations("schedules");
  const { schedules, loading, error, createSchedule, updateSchedule, deleteSchedule, toggleEnabled, triggerNow } =
    useSchedules();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [presetInput, setPresetInput] = useState<CreateScheduleInput | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  const handleNew = useCallback(() => {
    setEditingTask(null);
    setPresetInput(null);
    setEditModalOpen(true);
  }, []);

  const handleIdea = useCallback(
    (preset: SchedulePreset) => {
      setEditingTask(null);
      setPresetInput({
        name: t(`ideas.${preset.id}.name`),
        cardTitle: t(`ideas.${preset.id}.cardTitle`),
        cardDescription: t(`ideas.${preset.id}.description`),
        agentPrompt: t(`ideas.${preset.id}.prompt`),
        tags: preset.tags,
        schedule: preset.schedule,
        enabled: true,
      });
      setEditModalOpen(true);
    },
    [t],
  );

  const handleEdit = useCallback((task: ScheduledTask) => {
    setEditingTask(task);
    setPresetInput(null);
    setEditModalOpen(true);
  }, []);

  const handleTrigger = useCallback(
    async (id: string) => {
      setTriggering(id);
      try {
        await triggerNow(id);
      } finally {
        setTriggering(null);
      }
    },
    [triggerNow],
  );

  const handleSave = useCallback(
    async (input: CreateScheduleInput | UpdateScheduleInput) => {
      if ("id" in input) {
        await updateSchedule(input);
      } else {
        await createSchedule(input);
      }
      setEditModalOpen(false);
    },
    [createSchedule, updateSchedule],
  );

  const sorted = [...schedules].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const ta = a.nextRunAt ? Date.parse(a.nextRunAt) : Infinity;
    const tb = b.nextRunAt ? Date.parse(b.nextRunAt) : Infinity;
    return ta - tb;
  });

  // Tag suggestions for the editor: every tag already used across schedules.
  const availableTags = useMemo(
    () => [...new Set(schedules.flatMap((s) => s.tags.map(normalizeTag)).filter(Boolean))],
    [schedules],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClockIcon className="size-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <Button size="sm" onClick={handleNew}>
          <PlusIcon className="size-3.5" />
          {t("newSchedule")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">{t("emptyState")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((task) => (
            <Card key={task.id} className={`py-0 ${!task.enabled ? "opacity-60" : ""}`}>
              <CardContent className="flex items-center gap-4 px-4 py-2.5">
                <Switch checked={task.enabled} onCheckedChange={(v) => toggleEnabled(task.id, v)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.name}</p>
                  <p className="text-xs text-muted-foreground">{describeSchedule(task.schedule)}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  {task.nextRunAt && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("next", { time: formatHm(task.nextRunAt) })}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleTrigger(task.id)}
                    disabled={triggering === task.id}
                    title={t("actions.runNow")}
                  >
                    <PlayIcon />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => handleEdit(task)} title={t("actions.edit")}>
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => deleteSchedule(task.id)}
                    title={t("actions.delete")}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-2">
        <p className="text-xs font-medium text-muted-foreground">{t("ideas.heading")}</p>
        <div className="flex flex-wrap gap-2">
          {SCHEDULE_PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <Button key={preset.id} variant="outline" size="sm" onClick={() => handleIdea(preset)}>
                <Icon className="size-3.5" />
                {t(`ideas.${preset.id}.label`)}
              </Button>
            );
          })}
        </div>
      </div>

      <ScheduleEditModal
        key={`${editingTask?.id ?? presetInput?.name ?? "new"}-${editModalOpen}`}
        open={editModalOpen}
        task={editingTask}
        initial={presetInput}
        availableTags={availableTags}
        onSave={handleSave}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  );
}

interface ScheduleEditModalProps {
  open: boolean;
  task: ScheduledTask | null;
  initial?: CreateScheduleInput | null;
  availableTags?: string[];
  onSave: (input: CreateScheduleInput | UpdateScheduleInput) => Promise<void>;
  onClose: () => void;
}

/** Strip common agent-CLI noise (code fences, surrounding quotes) from a
 *  one-shot completion so the raw model text lands cleanly in the field. */
function cleanGenerated(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function ScheduleEditModal({ open, task, initial, availableTags = [], onSave, onClose }: ScheduleEditModalProps) {
  const t = useTranslations("schedules");
  const { settings, save: saveSettings } = useSettings();
  const agentPresets = settings.agents;
  const defaultAgentId = settings.defaultAgentId;

  // Editing an existing task wins; otherwise seed from a clicked "More ideas" preset.
  const seed = task ?? initial ?? null;
  const [name, setName] = useState(seed?.name ?? "");
  const [cardTitle, setCardTitle] = useState(seed?.cardTitle ?? "");
  const [cardDescription, setCardDescription] = useState(seed?.cardDescription ?? "");
  const [agentPrompt, setAgentPrompt] = useState(seed?.agentPrompt ?? "");
  const [tagList, setTagList] = useState<string[]>(() => [
    ...new Set((seed?.tags ?? []).map(normalizeTag).filter(Boolean)),
  ]);
  const [tagInput, setTagInput] = useState("");
  const [kindType, setKindType] = useState<ScheduleKindType>(seed?.schedule.type ?? "daily");
  const [schedule, setSchedule] = useState<ScheduleKind>(seed?.schedule ?? defaultScheduleKind("daily"));
  const [enabled, setEnabled] = useState(seed?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  // Agent run config inherited by every materialized card (mirrors New Task).
  const [agentPresetId, setAgentPresetId] = useState(seed?.agentPresetId ?? "");
  const [agentFlags, setAgentFlags] = useState<string[] | undefined>(seed?.agentFlags);
  const [useWorktree, setUseWorktree] = useState<boolean | undefined>(seed?.useWorktree);
  const [workingDir, setWorkingDir] = useState(seed?.workingDir ?? "");
  const [launchVia, setLaunchVia] = useState<"direct" | "ollama" | undefined>(seed?.launchVia);
  const [ollamaModel, setOllamaModel] = useState<string | undefined>(seed?.ollamaModel);

  // Raw text of the "cron equivalent" field while the user types; null = follow
  // the structured schedule (so the cron shows the derived form).
  const [cronDraft, setCronDraft] = useState<string | null>(null);

  // Live preset connectivity-test state, keyed by preset id (seeded from cache).
  const [testResults, setTestResults] = useState<Record<string, StoredTestResult | null>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<null | "prompt" | "tags">(null);
  // A generated prompt waiting for the user to accept/dismiss (so questions the
  // agent raises are surfaced rather than silently dropped into the field).
  const [promptDraft, setPromptDraft] = useState<string | null>(null);

  const selectedPreset = useMemo(() => agentPresets.find((p) => p.id === agentPresetId), [agentPresets, agentPresetId]);
  const selectedTest = agentPresetId ? (testResults[agentPresetId] ?? null) : null;
  // A preset whose live test failed can't be accepted; one mid-test blocks too.
  const presetBlocked = Boolean(selectedPreset) && (selectedTest?.status === "failed" || testingId === agentPresetId);

  // Seed the default preset + cached test results once settings finish loading.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time seed when presets load
  useEffect(() => {
    if (agentPresets.length === 0) return;
    setAgentPresetId((cur) => (cur ? cur : (seed?.agentPresetId ?? defaultAgentId ?? agentPresets[0]?.id ?? "")));
    setTestResults((cur) => {
      if (Object.keys(cur).length > 0) return cur;
      const map: Record<string, StoredTestResult | null> = {};
      for (const p of agentPresets) {
        // Prefer the local cache; fall back to the durable "tested" flag stored
        // on the preset in settings (e.g. a fresh machine with no cache yet).
        map[p.id] =
          loadTestResult(p.id) ?? (p.lastTestedAt ? { status: "passed", ts: Date.parse(p.lastTestedAt) } : null);
      }
      return map;
    });
  }, [agentPresets, defaultAgentId]);

  /** Run `test_agent` for a preset, cache + reflect the result. Returns pass. */
  const runPresetTest = useCallback(
    async (preset: AgentPreset): Promise<boolean> => {
      if (!isTauri()) return true; // No sidecar in the browser — don't block dev.
      setTestingId(preset.id);
      try {
        await invoke("test_agent", {
          binary: preset.binary,
          argsTemplate: preset.argsTemplate,
          workingDir: preset.workingDir ?? null,
        });
        const result = persistTestResult(preset.id, "passed");
        setTestResults((cur) => ({ ...cur, [preset.id]: result }));
        // Persist the pass into settings data so the "tested" state is durable
        // (survives reloads, shared with Settings) — not just a localStorage cache.
        void saveSettings({
          ...settings,
          agents: settings.agents.map((p) =>
            p.id === preset.id ? { ...p, lastTestedAt: new Date().toISOString() } : p,
          ),
        });
        return true;
      } catch (err) {
        const reason = err instanceof Error ? err.message : typeof err === "string" ? err : undefined;
        const result = persistTestResult(preset.id, "failed", reason);
        setTestResults((cur) => ({ ...cur, [preset.id]: result }));
        toast.error(t("agent.testFailedToast", { name: preset.name }));
        return false;
      } finally {
        setTestingId(null);
      }
    },
    [t, settings, saveSettings],
  );

  const handlePresetChange = (value: string) => {
    setAgentPresetId(value);
    // Card-level overrides belong to the previous preset — drop them so the
    // options editor falls back to the newly selected preset's defaults.
    setAgentFlags(undefined);
    setUseWorktree(undefined);
    setLaunchVia(undefined);
    setOllamaModel(undefined);
    const preset = agentPresets.find((p) => p.id === value);
    // Auto-test on select unless a passing result is already cached.
    if (preset && testResults[value]?.status !== "passed") void runPresetTest(preset);
  };

  // ── tags ───────────────────────────────────────────────────────────────
  const tagSuggestions = useMemo(() => {
    const needle = normalizeTag(tagInput);
    return [...new Set(availableTags.map(normalizeTag))]
      .filter((tag) => tag && !tagList.includes(tag) && (!needle || tag.includes(needle)))
      .slice(0, 8);
  }, [availableTags, tagInput, tagList]);

  const addTag = useCallback((value: string) => {
    const tag = normalizeTag(value);
    if (!tag) return;
    setTagList((cur) => (cur.includes(tag) ? cur : [...cur, tag]));
    setTagInput("");
  }, []);
  const removeTag = (tag: string) => setTagList((cur) => cur.filter((x) => x !== tag));
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput) {
      setTagList((cur) => cur.slice(0, -1));
    }
  };

  // ── LLM one-shot generation (runs the selected preset's agent) ──────────
  const runAgentComplete = useCallback(
    async (metaPrompt: string): Promise<string | null> => {
      if (!selectedPreset) {
        toast.error(t("agent.needPreset"));
        return null;
      }
      if (!isTauri()) {
        toast.error(t("agent.devOnly"));
        return null;
      }
      const res = await invoke<{ output?: string }>("agent_complete", {
        binary: selectedPreset.binary,
        argsTemplate: selectedPreset.argsTemplate,
        prompt: metaPrompt,
        flags: agentFlags ?? selectedPreset.flags ?? [],
        workingDir: workingDir.trim() ? workingDir.trim() : (selectedPreset.workingDir ?? null),
        launchVia: launchVia ?? selectedPreset.launchVia ?? "direct",
        ollamaModel: ollamaModel ?? selectedPreset.ollamaModel ?? null,
      });
      return res?.output ?? null;
    },
    [selectedPreset, agentFlags, workingDir, launchVia, ollamaModel, t],
  );

  // Both drafters need a name + description to give the agent any context.
  const hasContext = name.trim().length > 0 && cardDescription.trim().length > 0;

  const handleGeneratePrompt = async () => {
    if (!hasContext) {
      toast.error(t("agent.needContext"));
      return;
    }
    setGenerating("prompt");
    try {
      const meta = t("agent.promptMeta", { name: name.trim(), description: cardDescription.trim() });
      const out = await runAgentComplete(meta);
      const text = out ? cleanGenerated(out) : "";
      // Show the result as a draft to review (so questions surface) instead of
      // overwriting the field outright.
      if (text) setPromptDraft(text);
      else if (out !== null) toast.error(t("agent.generateEmpty"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("agent.generateError"));
    } finally {
      setGenerating(null);
    }
  };

  const handleSuggestTags = async () => {
    if (!hasContext) {
      toast.error(t("agent.needContext"));
      return;
    }
    setGenerating("tags");
    try {
      const meta = t("agent.tagsMeta", { name: name.trim(), description: cardDescription.trim() });
      const out = await runAgentComplete(meta);
      const proposed = (out ? cleanGenerated(out) : "").split(/[,\n]/).map(normalizeTag).filter(Boolean).slice(0, 6);
      if (proposed.length === 0) {
        if (out !== null) toast.error(t("agent.generateEmpty"));
        return;
      }
      setTagList((cur) => [...new Set([...cur, ...proposed])]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("agent.generateError"));
    } finally {
      setGenerating(null);
    }
  };

  const handleKindChange = (type: ScheduleKindType) => {
    setKindType(type);
    setSchedule(defaultScheduleKind(type));
    setCronDraft(null); // structured edit → cron field follows again
  };

  // Edits to the structured fields go through here so the cron field re-derives.
  const handleScheduleChange = (next: ScheduleKind) => {
    setSchedule(next);
    setCronDraft(null);
  };

  // Cron field value: the user's draft while typing, else the derived form.
  const cronValue = cronDraft ?? scheduleToCron(schedule) ?? "";
  const cronExpressible = schedule.type === "cron" || scheduleToCron(schedule) !== null;

  // Editing the cron text re-derives the kind: a daily/weekly/interval match
  // selects that type, anything else falls back to a raw cron ("custom").
  const handleCronChange = (text: string) => {
    setCronDraft(text);
    const parsed = cronToSchedule(text);
    if (parsed) {
      setSchedule(parsed);
      setKindType(parsed.type);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cardTitle.trim() || presetBlocked) return;
    setSaving(true);
    try {
      const input: CreateScheduleInput = {
        name: name.trim(),
        cardTitle: cardTitle.trim(),
        cardDescription,
        agentPrompt,
        tags: tagList,
        schedule,
        enabled,
        agentPresetId: agentPresetId || undefined,
        agentFlags,
        useWorktree,
        workingDir: workingDir.trim() || undefined,
        launchVia,
        ollamaModel,
      };
      if (task) {
        await onSave({ ...input, id: task.id });
      } else {
        await onSave(input);
      }
    } finally {
      setSaving(false);
    }
  };

  const canGenerate = Boolean(selectedPreset) && !presetBlocked && generating === null;
  // Heuristic: a draft containing a question mark is likely the agent asking for
  // clarification rather than a ready-to-use prompt — flag it so the user answers.
  const promptDraftIsQuestion = promptDraft !== null && promptDraft.includes("?");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="no-scrollbar sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlusIcon className="size-4 text-muted-foreground" />
            {task ? t("editSchedule") : t("newSchedule")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("form.scheduleName")} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.scheduleNamePlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("form.cardTitle")} *</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 gap-1 text-muted-foreground"
                onClick={() => setCardTitle(name)}
                disabled={!name.trim()}
                title={t("form.copyName")}
              >
                <CopyIcon className="size-3" />
                {t("form.copyName")}
              </Button>
            </div>
            <Input
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              placeholder={t("form.cardTitlePlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t("form.description")}</Label>
            <Textarea
              value={cardDescription}
              onChange={(e) => setCardDescription(e.target.value)}
              rows={2}
              placeholder={t("form.descriptionPlaceholder")}
            />
          </div>

          {agentPresets.length > 0 && (
            <div className="space-y-2 rounded-lg border bg-foreground/5 p-3">
              <Label>{t("form.agentPreset")}</Label>
              <Select value={agentPresetId} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("agent.needPreset")} />
                </SelectTrigger>
                <SelectContent>
                  {agentPresets.map((preset) => {
                    const r = testResults[preset.id];
                    return (
                      <SelectItem key={preset.id} value={preset.id}>
                        <span className="flex items-center gap-2">
                          {preset.name}
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
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
                            {r?.status === "passed"
                              ? t("agent.tested")
                              : r?.status === "failed"
                                ? t("agent.testFailed")
                                : t("agent.untested")}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {selectedPreset && testingId === agentPresetId && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3 animate-spin" />
                  {t("agent.testing", { name: selectedPreset.name })}
                </p>
              )}
              {selectedPreset && presetBlocked && selectedTest?.status === "failed" && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <XCircleIcon className="size-3" />
                    {t("agent.blocked")}
                  </p>
                  {selectedTest.reason && (
                    <p className="rounded-md bg-destructive/10 px-2 py-1.5 font-mono text-[11px] text-destructive">
                      {selectedTest.reason}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => selectedPreset && void runPresetTest(selectedPreset)}
                    disabled={testingId !== null}
                  >
                    <FlaskConicalIcon className="size-3" />
                    {t("agent.retry")}
                  </Button>
                </div>
              )}

              {selectedPreset && (
                <details className="group rounded-md border bg-background/40 px-2.5 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground text-xs hover:text-foreground">
                    <ChevronRightIcon className="size-3 transition-transform group-open:rotate-90" />
                    {t("form.override")}
                  </summary>
                  <div className="pt-2">
                    <AgentOptions
                      binary={selectedPreset.binary}
                      flags={agentFlags ?? selectedPreset.flags ?? []}
                      useWorktree={useWorktree ?? selectedPreset.useWorktree ?? false}
                      launchVia={launchVia ?? selectedPreset.launchVia ?? "direct"}
                      ollamaModel={ollamaModel ?? selectedPreset.ollamaModel ?? ""}
                      onFlagsChange={setAgentFlags}
                      onWorktreeChange={setUseWorktree}
                      onLaunchViaChange={setLaunchVia}
                      onOllamaModelChange={setOllamaModel}
                    />
                  </div>
                </details>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FolderIcon className="size-3.5 text-muted-foreground" />
              {t("form.workingDir")}
              <span className="font-normal text-muted-foreground">({t("form.optional")})</span>
            </Label>
            <WorkingDirField value={workingDir} onChange={setWorkingDir} placeholder={selectedPreset?.workingDir ?? ""} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("form.agentPrompt")}</Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void handleGeneratePrompt()}
                disabled={!canGenerate}
                title={selectedPreset ? t("agent.generateHint") : t("agent.needPreset")}
              >
                {generating === "prompt" ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3" />
                )}
                {t("actions.generate")}
              </Button>
            </div>
            <Textarea
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />
            {promptDraft !== null && (
              <div className="space-y-1.5 rounded-md border bg-foreground/5 p-2.5">
                <div className="flex items-center gap-1.5 font-medium text-xs">
                  {promptDraftIsQuestion ? (
                    <HelpCircleIcon className="size-3.5 text-amber-500" />
                  ) : (
                    <SparklesIcon className="size-3.5 text-muted-foreground" />
                  )}
                  {promptDraftIsQuestion ? t("agent.previewQuestion") : t("agent.previewTitle")}
                </div>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-background px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {promptDraft}
                </p>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => {
                      setAgentPrompt(promptDraft);
                      setPromptDraft(null);
                    }}
                  >
                    {t("agent.useDraft")}
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setPromptDraft(null)}>
                    {t("agent.dismissDraft")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("form.tags")}</Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void handleSuggestTags()}
                disabled={!canGenerate}
                title={selectedPreset ? t("agent.generateHint") : t("agent.needPreset")}
              >
                {generating === "tags" ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3" />
                )}
                {t("actions.suggestTags")}
              </Button>
            </div>
            <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
              {tagList.map((tag) => (
                <Badge key={tag} variant="outline" className={tagClassName(tag, "h-6 gap-1 pr-1")}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="rounded-full p-0.5 hover:bg-background/60"
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => addTag(tagInput)}
                placeholder={tagList.length === 0 ? t("form.tagsPlaceholder") : ""}
                className="h-7 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              />
            </div>
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tagSuggestions.map((tag) => (
                  <Button key={tag} type="button" variant="outline" size="xs" onClick={() => addTag(tag)}>
                    {tag}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("form.scheduleKind")}</Label>
            <div className="flex flex-wrap items-end gap-2">
              <Select value={kindType} onValueChange={(v) => handleKindChange(v as ScheduleKindType)}>
                <SelectTrigger className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">{t("kind.once")}</SelectItem>
                  <SelectItem value="daily">{t("kind.daily")}</SelectItem>
                  <SelectItem value="weekly">{t("kind.weekly")}</SelectItem>
                  <SelectItem value="interval">{t("kind.interval")}</SelectItem>
                  <SelectItem value="cron">{t("kind.custom")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Structured field(s) for the kind, inline to the right. */}
              {kindType !== "cron" && (
                <div className="flex flex-wrap items-end gap-2">
                  <ScheduleKindFields schedule={schedule} onChange={handleScheduleChange} inline />
                </div>
              )}

              {/* Cron equivalent — sits right after the time, with a margin. */}
              <div className="ml-2 flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {t("form.cronEquivalent")}
                </Label>
                <Input
                  value={cronValue}
                  onChange={(e) => handleCronChange(e.target.value)}
                  placeholder={cronExpressible ? "0 9 * * *" : t("form.cronNotExpressible")}
                  disabled={!cronExpressible && kindType !== "cron"}
                  className="h-8 w-36 font-mono text-xs"
                  title={t("form.cronEquivalent")}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>{t("enabled")}</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || !cardTitle.trim() || presetBlocked || saving}>
              {saving ? t("actions.saving") : task ? t("actions.update") : t("actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleKindFields({
  schedule,
  onChange,
  inline = false,
}: {
  schedule: ScheduleKind;
  onChange: (s: ScheduleKind) => void;
  inline?: boolean;
}) {
  const t = useTranslations("schedules");
  const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  // Wrap a labelled control: compact (tiny label, fixed-height input) when inline
  // so it sits on the schedule-type row, otherwise the original stacked block.
  const field = (label: string, control: React.ReactNode) =>
    inline ? (
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
        {control}
      </div>
    ) : (
      <div className="space-y-2">
        <Label>{label}</Label>
        {control}
      </div>
    );

  switch (schedule.type) {
    case "once":
      return field(
        t("form.dateTime"),
        <Input
          type="datetime-local"
          value={schedule.at}
          onChange={(e) => onChange({ type: "once", at: e.target.value })}
          className={inline ? "h-8 w-52" : undefined}
        />,
      );
    case "daily":
      return field(
        t("form.time"),
        <Input
          type="time"
          value={schedule.time}
          onChange={(e) => onChange({ type: "daily", time: e.target.value })}
          className={inline ? "h-8 w-28" : undefined}
        />,
      );
    case "weekly":
      return (
        <>
          {field(
            t("form.time"),
            <Input
              type="time"
              value={schedule.time}
              onChange={(e) => onChange({ ...schedule, time: e.target.value })}
              className={inline ? "h-8 w-28" : undefined}
            />,
          )}
          {field(
            t("form.days"),
            <div className="flex flex-wrap gap-1">
              {weekdays.map((dayKey, i) => {
                const dayNum = i + 1;
                const active = schedule.days.includes(dayNum);
                return (
                  <Button
                    key={dayKey}
                    type="button"
                    size="xs"
                    variant={active ? "default" : "outline"}
                    onClick={() => {
                      const days = active
                        ? schedule.days.filter((d) => d !== dayNum)
                        : [...schedule.days, dayNum].sort();
                      onChange({ ...schedule, days });
                    }}
                  >
                    {t(`days.${dayKey}`)}
                  </Button>
                );
              })}
            </div>,
          )}
        </>
      );
    case "interval":
      return (
        <>
          {field(
            t("form.startTime"),
            <Input
              type="time"
              value={schedule.start}
              onChange={(e) => onChange({ ...schedule, start: e.target.value })}
              className={inline ? "h-8 w-28" : undefined}
            />,
          )}
          {field(
            t("form.minutes"),
            <Input
              type="number"
              min={1}
              value={schedule.minutes}
              onChange={(e) => onChange({ ...schedule, minutes: Number(e.target.value) || 60 })}
              className={inline ? "h-8 w-20" : undefined}
            />,
          )}
        </>
      );
    case "cron":
      return field(
        t("form.cronExpression"),
        <Input
          value={schedule.expr}
          onChange={(e) => onChange({ type: "cron", expr: e.target.value })}
          placeholder={t("form.cronPlaceholder")}
          className={cn("font-mono text-xs", inline && "h-8 w-40")}
        />,
      );
  }
}
