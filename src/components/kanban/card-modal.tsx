"use client";

import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  FlaskConicalIcon,
  FolderIcon,
  HelpCircleIcon,
  Loader2Icon,
  LockIcon,
  RotateCcwIcon,
  ScrollTextIcon,
  SparklesIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AgentOptions } from "@/components/agents/agent-options";
import { WorkingDirField } from "@/components/agents/working-dir-field";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConnections } from "@/hooks/use-connections";
import { useSettings } from "@/hooks/use-settings";
import { loadTestResult, persistTestResult, type StoredTestResult } from "@/lib/agent-test-store";
import { normalizeTag, tagClassName } from "@/lib/kanban-tags";
import { invoke } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { CardFormData, CardTemplate, KanbanCard, KanbanStatus } from "@/types/kanban";
import type { AgentPreset } from "@/types/settings";

const NO_TEMPLATE = "__none";

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

interface CardModalProps {
  open: boolean;
  mode: "add" | "edit";
  initialStatus?: KanbanStatus;
  card?: KanbanCard;
  availableTags?: string[];
  templates?: CardTemplate[];
  agentPresets?: AgentPreset[];
  defaultAgentId?: string;
  /** Live log lines for this card (streamed while the modal is open). */
  logLines?: string[];
  /** Live run state — kept separate from `card` so the form snapshot doesn't reset on board updates. */
  isRunning?: boolean;
  onSave: (data: CardFormData, status: KanbanStatus, targetConnId?: string) => Promise<void>;
  onSaveTemplate?: (template: Omit<CardTemplate, "id" | "createdAt">) => void;
  onLaunch?: (cardId: string) => Promise<void>;
  onOpenWorkingDir?: (cardId: string) => Promise<void>;
  onClose: () => void;
}

export function CardModal({
  open,
  mode,
  initialStatus = "draft",
  card,
  availableTags = [],
  templates = [],
  agentPresets = [],
  defaultAgentId,
  logLines,
  isRunning = false,
  onSave,
  // onSaveTemplate, // "Save as template" hidden for now
  onLaunch,
  onOpenWorkingDir,
  onClose,
}: CardModalProps) {
  const t = useTranslations("kanban.cardModal");
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [agentPrompt, setAgentPrompt] = useState(card?.agentPrompt ?? "");
  const [workingDir, setWorkingDir] = useState(card?.workingDir ?? "");
  const [launching, setLaunching] = useState(false);
  const [tagList, setTagList] = useState<string[]>(card?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [status, setStatus] = useState<KanbanStatus>(card?.status ?? initialStatus);
  const [agentPresetId, setAgentPresetId] = useState(
    card?.agentPresetId ?? defaultAgentId ?? agentPresets[0]?.id ?? "",
  );
  const [agentFlags, setAgentFlags] = useState<string[] | undefined>(card?.agentFlags);
  const [useWorktree, setUseWorktree] = useState<boolean | undefined>(card?.useWorktree);
  const [launchVia, setLaunchVia] = useState<"direct" | "ollama" | undefined>(card?.launchVia);
  const [ollamaModel, setOllamaModel] = useState<string | undefined>(card?.ollamaModel);
  const [selectedTemplateId, setSelectedTemplateId] = useState(NO_TEMPLATE);
  // const [templateName, setTemplateName] = useState(""); // "Save as template" hidden for now
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const { connections, primaryId } = useConnections();
  const [targetConnId, setTargetConnId] = useState(primaryId);

  // ── Agent assist (live preset test + LLM drafting, mirrors New Schedule) ──
  const { settings, save: saveSettings } = useSettings();
  // Live preset connectivity-test state, keyed by preset id (seeded from cache).
  const [testResults, setTestResults] = useState<Record<string, StoredTestResult | null>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<null | "prompt" | "tags">(null);
  // A generated prompt waiting for the user to accept/dismiss (so questions the
  // agent raises are surfaced rather than silently dropped into the field).
  const [promptDraft, setPromptDraft] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(card?.title ?? "");
      setDescription(card?.description ?? "");
      setAgentPrompt(card?.agentPrompt ?? "");
      setWorkingDir(card?.workingDir ?? "");
      setTagList(dedupeTags(card?.tags ?? []));
      setTagInput("");
      setStatus(card?.status ?? initialStatus);
      setAgentPresetId(card?.agentPresetId ?? defaultAgentId ?? agentPresets[0]?.id ?? "");
      setAgentFlags(card?.agentFlags);
      setUseWorktree(card?.useWorktree);
      setLaunchVia(card?.launchVia);
      setOllamaModel(card?.ollamaModel);
      setSelectedTemplateId(NO_TEMPLATE);
      // setTemplateName(""); // "Save as template" hidden for now
      setTargetConnId(primaryId);
      setPromptDraft(null);
      setGenerating(null);
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open, card, initialStatus, defaultAgentId, agentPresets, primaryId]);

  // Seed cached test results once presets are known (cache → durable flag).
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time seed when presets load
  useEffect(() => {
    if (agentPresets.length === 0) return;
    setTestResults((cur) => {
      if (Object.keys(cur).length > 0) return cur;
      const map: Record<string, StoredTestResult | null> = {};
      for (const p of agentPresets) {
        map[p.id] =
          loadTestResult(p.id) ?? (p.lastTestedAt ? { status: "passed", ts: Date.parse(p.lastTestedAt) } : null);
      }
      return map;
    });
  }, [agentPresets]);

  const tagSuggestions = useMemo(() => {
    const needle = normalizeTag(tagInput);
    return dedupeTags(availableTags)
      .filter((tag) => !tagList.includes(tag))
      .filter((tag) => !needle || tag.includes(needle))
      .slice(0, 8);
  }, [availableTags, tagInput, tagList]);

  const addTag = useCallback((value: string) => {
    const tag = normalizeTag(value);
    if (!tag) return;
    setTagList((current) => (current.includes(tag) ? current : [...current, tag]));
    setTagInput("");
  }, []);

  const removeTag = (tag: string) => {
    setTagList((current) => current.filter((item) => item !== tag));
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput);
      return;
    }
    if (event.key === "Backspace" && !tagInput) {
      setTagList((current) => current.slice(0, -1));
    }
  };

  const selectedPreset = useMemo(
    () => agentPresets.find((preset) => preset.id === agentPresetId),
    [agentPresets, agentPresetId],
  );
  const selectedTest = agentPresetId ? (testResults[agentPresetId] ?? null) : null;
  // A preset whose live test failed can't be accepted; one mid-test blocks too.
  const presetBlocked = Boolean(selectedPreset) && (selectedTest?.status === "failed" || testingId === agentPresetId);

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
        // Persist the pass into settings so the "tested" state is durable and
        // shared with Settings / the schedule modal — not just a local cache.
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
        toast.error(t("assist.testFailedToast", { name: preset.name }));
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

  // ── LLM one-shot generation (runs the selected preset's agent) ──────────
  const runAgentComplete = useCallback(
    async (metaPrompt: string): Promise<string | null> => {
      if (!selectedPreset) {
        toast.error(t("assist.needPreset"));
        return null;
      }
      if (!isTauri()) {
        toast.error(t("assist.devOnly"));
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

  // Both drafters need a title + description to give the agent any context.
  const hasContext = title.trim().length > 0 && description.trim().length > 0;
  const canGenerate = Boolean(selectedPreset) && !presetBlocked && generating === null;
  // Heuristic: a draft containing a question mark is likely the agent asking for
  // clarification rather than a ready-to-use prompt — flag it so the user answers.
  const promptDraftIsQuestion = promptDraft !== null && promptDraft.includes("?");

  const handleGeneratePrompt = async () => {
    if (!hasContext) {
      toast.error(t("assist.needContext"));
      return;
    }
    setGenerating("prompt");
    try {
      const meta = t("assist.promptMeta", { name: title.trim(), description: description.trim() });
      const out = await runAgentComplete(meta);
      const text = out ? cleanGenerated(out) : "";
      // Show the result as a draft to review (so questions surface) instead of
      // overwriting the field outright.
      if (text) setPromptDraft(text);
      else if (out !== null) toast.error(t("assist.generateEmpty"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("assist.generateError"));
    } finally {
      setGenerating(null);
    }
  };

  const handleSuggestTags = async () => {
    if (!hasContext) {
      toast.error(t("assist.needContext"));
      return;
    }
    setGenerating("tags");
    try {
      const meta = t("assist.tagsMeta", { name: title.trim(), description: description.trim() });
      const out = await runAgentComplete(meta);
      const proposed = (out ? cleanGenerated(out) : "").split(/[,\n]/).map(normalizeTag).filter(Boolean).slice(0, 6);
      if (proposed.length === 0) {
        if (out !== null) toast.error(t("assist.generateEmpty"));
        return;
      }
      setTagList((cur) => [...new Set([...cur, ...proposed])]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("assist.generateError"));
    } finally {
      setGenerating(null);
    }
  };

  const handleTemplateChange = (value: string) => {
    setSelectedTemplateId(value);
    if (value === NO_TEMPLATE) return;
    const template = templates.find((item) => item.id === value);
    if (!template) return;
    setDescription(template.description);
    setAgentPrompt(template.agentPrompt);
    setTagList(dedupeTags(template.tags));
    setAgentPresetId(template.agentPresetId ?? defaultAgentId ?? agentPresets[0]?.id ?? "");
  };

  // "Save as template" hidden for now — re-enable with the JSX block below.
  // const handleSaveTemplate = () => {
  //   const name = templateName.trim();
  //   if (!name || !onSaveTemplate) return;
  //   onSaveTemplate({
  //     name,
  //     description,
  //     agentPrompt,
  //     tags: tagList,
  //     agentPresetId: agentPresetId || undefined,
  //   });
  //   setTemplateName("");
  // };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || presetBlocked) return;
    setSaving(true);
    try {
      await onSave(
        {
          title: title.trim(),
          description,
          agentPrompt,
          tags: tagList.join(", "),
          agentPresetId: agentPresetId || undefined,
          workingDir: workingDir.trim() || undefined,
          agentFlags,
          useWorktree,
          launchVia,
          ollamaModel,
        },
        status,
        mode === "add" ? targetConnId : undefined,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRelaunch = async () => {
    if (!card || !onLaunch) return;
    setLaunching(true);
    try {
      // Persist any edits first so the agent picks up the latest prompt/dir.
      await onSave(
        {
          title: title.trim(),
          description,
          agentPrompt,
          tags: tagList.join(", "),
          agentPresetId: agentPresetId || undefined,
          workingDir: workingDir.trim() || undefined,
          agentFlags,
          useWorktree,
          launchVia,
          ollamaModel,
        },
        status,
      );
      await onLaunch(card.id);
      onClose();
    } finally {
      setLaunching(false);
    }
  };

  const runStats = useMemo(() => summarizeRuns(card?.runHistory ?? []), [card?.runHistory]);
  const canRelaunch = mode === "edit" && card && onLaunch && card.status !== "in_progress" && !card.agentQueued;
  // Only draft tasks are editable. Once a task leaves the Draft column it's
  // locked: fields are disabled and Save is blocked (move it back to Draft to
  // edit). This also covers running/queued cards mid-run.
  const locked = mode === "edit" && Boolean(card) && card?.status !== "draft";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>{mode === "add" ? t("newTitle") : t("editTitle")}</DialogTitle>
          <DialogDescription>{mode === "add" ? t("newDescription") : t("editDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <fieldset
            disabled={locked}
            className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto border-0 p-4 disabled:opacity-60"
          >
            {locked && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400">
                <LockIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("locked")}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="card-title">
                {t("title")} <span className="text-destructive">*</span>
              </Label>
              <Input
                ref={titleRef}
                id="card-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("titlePlaceholder")}
                required
              />
            </div>

            {mode === "edit" && card && ((logLines?.length ?? 0) > 0 || isRunning) && (
              <LiveLogPanel lines={logLines ?? []} running={isRunning} />
            )}

            {mode === "add" && connections.length > 1 && (
              <div className="space-y-2">
                <Label>{t("targetServer")}</Label>
                <Select value={targetConnId} onValueChange={setTargetConnId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        {conn.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {templates.length > 0 && (
              <div className="space-y-2">
                <Label>{t("template")}</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("templatePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>{t("noTemplate")}</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="card-desc">{t("description")}</Label>
              <Textarea
                id="card-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="card-tags">{t("tags")}</Label>
                {agentPresets.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void handleSuggestTags()}
                    disabled={!canGenerate}
                    title={selectedPreset ? t("assist.generateHint") : t("assist.needPreset")}
                  >
                    {generating === "tags" ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <SparklesIcon className="size-3" />
                    )}
                    {t("suggestTags")}
                  </Button>
                )}
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
                  id="card-tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag(tagInput)}
                  placeholder={tagList.length === 0 ? t("tagsPlaceholder") : t("tagInputPlaceholder")}
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

            {agentPresets.length > 0 && (
              <div className="space-y-2 rounded-lg border bg-foreground/5 p-3">
                <Label>{t("agentPreset")}</Label>
                <Select value={agentPresetId} onValueChange={handlePresetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("agentPresetPlaceholder")} />
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
                                ? t("assist.tested")
                                : r?.status === "failed"
                                  ? t("assist.testFailed")
                                  : t("assist.untested")}
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
                    {t("assist.testing", { name: selectedPreset.name })}
                  </p>
                )}
                {selectedPreset && presetBlocked && selectedTest?.status === "failed" && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircleIcon className="size-3" />
                      {t("assist.blocked")}
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
                      {t("assist.retry")}
                    </Button>
                  </div>
                )}

                {selectedPreset && (
                  <details className="group rounded-md border bg-background/40 px-2.5 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground text-xs hover:text-foreground">
                      <ChevronRightIcon className="size-3 transition-transform group-open:rotate-90" />
                      {t("override")}
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
              <Label htmlFor="card-working-dir" className="flex items-center gap-2">
                <FolderIcon className="size-3.5 text-muted-foreground" />
                {t("workingDir")}
                <span className="font-normal text-muted-foreground">({t("optional")})</span>
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <WorkingDirField
                    id="card-working-dir"
                    value={workingDir}
                    onChange={setWorkingDir}
                    placeholder={t("workingDirPlaceholder")}
                  />
                </div>
                {mode === "edit" && card && onOpenWorkingDir && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={t("openWorkingDir")}
                    onClick={() => onOpenWorkingDir(card.id)}
                  >
                    <FolderIcon className="size-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="card-prompt" className="flex items-center gap-2">
                  {t("prompt")}
                  <span className="font-normal text-muted-foreground">({t("optional")})</span>
                </Label>
                {agentPresets.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void handleGeneratePrompt()}
                    disabled={!canGenerate}
                    title={selectedPreset ? t("assist.generateHint") : t("assist.needPreset")}
                  >
                    {generating === "prompt" ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <SparklesIcon className="size-3" />
                    )}
                    {t("generate")}
                  </Button>
                )}
              </div>
              <Textarea
                id="card-prompt"
                data-ph-no-capture
                value={agentPrompt}
                onChange={(event) => setAgentPrompt(event.target.value)}
                placeholder={t("promptPlaceholder")}
                rows={4}
                className="font-mono text-xs"
              />
              {promptDraft !== null && (
                <div data-ph-no-capture className="space-y-1.5 rounded-md border bg-foreground/5 p-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-xs">
                    {promptDraftIsQuestion ? (
                      <HelpCircleIcon className="size-3.5 text-amber-500" />
                    ) : (
                      <SparklesIcon className="size-3.5 text-muted-foreground" />
                    )}
                    {promptDraftIsQuestion ? t("assist.previewQuestion") : t("assist.previewTitle")}
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
                      {t("assist.useDraft")}
                    </Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setPromptDraft(null)}>
                      {t("assist.dismissDraft")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* "Save as template" hidden for now — re-enable with handleSaveTemplate / templateName above.
            {onSaveTemplate && (
              <div className="rounded-lg border bg-foreground/5 p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder={t("templateNamePlaceholder")}
                  />
                  <Button type="button" variant="secondary" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                    {t("saveTemplate")}
                  </Button>
                </div>
              </div>
            )}
            */}

            {mode === "edit" && card?.revisionNotes && card.revisionNotes.length > 0 && (
              <div className="space-y-2">
                <Label>{t("revisionNotes", { count: card.revisionNotes.length })}</Label>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {card.revisionNotes.map((note, index) => (
                    <div
                      key={`${index}-${note}`}
                      className="rounded bg-muted px-2 py-1.5 text-muted-foreground text-xs"
                    >
                      <span className="mr-1 font-semibold text-foreground">v{index + 1}:</span>
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mode === "edit" && runStats.count > 0 && (
              <div className="grid grid-cols-3 gap-2 rounded-lg border bg-foreground/5 p-3 text-center">
                <Stat label={t("stats.runs")} value={String(runStats.count)} />
                <Stat label={t("stats.totalTime")} value={formatDuration(runStats.totalMs)} />
                <Stat
                  label={t("stats.totalCost")}
                  value={
                    runStats.totalCost > 0
                      ? `$${runStats.totalCost.toFixed(2)}`
                      : runStats.totalTokens > 0
                        ? `${runStats.totalTokens.toLocaleString()} tok`
                        : "—"
                  }
                />
              </div>
            )}
          </fieldset>

          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            {canRelaunch && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleRelaunch}
                disabled={launching || saving || presetBlocked}
              >
                <RotateCcwIcon className="size-3.5" />
                {launching ? t("relaunching") : t("relaunch")}
              </Button>
            )}
            <Button type="submit" disabled={!title.trim() || presetBlocked || saving || locked}>
              {saving ? t("saving") : mode === "add" ? t("create") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function dedupeTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

/** Terminal-style live output for the card's running agent, auto-scrolled to the tail. */
function LiveLogPanel({ lines, running }: { lines: string[]; running: boolean }) {
  const t = useTranslations("kanban.cardModal");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin to the bottom on every new line so the latest output stays visible.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on each new line to follow the tail
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {running ? (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-orange-500" />
          </span>
        ) : (
          <ScrollTextIcon className="size-3.5 text-muted-foreground" />
        )}
        <Label className="text-xs">{running ? t("liveLogs") : t("logs")}</Label>
      </div>
      {lines.length > 0 ? (
        <div
          ref={scrollRef}
          data-ph-no-capture
          className="max-h-64 overflow-y-auto rounded bg-foreground/95 p-2.5 font-mono text-[11px] leading-relaxed text-background/85"
        >
          {lines.map((line, i) => (
            <div key={i} className={cn("whitespace-pre-wrap break-words", line.startsWith("[err]") && "text-red-400")}>
              {line || " "}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">{t("waitingForOutput")}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="font-semibold text-sm tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

interface RunStats {
  count: number;
  totalMs: number;
  totalTokens: number;
  totalCost: number;
}

function summarizeRuns(runs: { startedAt: string; endedAt?: string; tokens?: number; cost?: number }[]): RunStats {
  let totalMs = 0;
  let totalTokens = 0;
  let totalCost = 0;
  for (const run of runs) {
    if (run.endedAt) {
      const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
      if (!Number.isNaN(ms) && ms > 0) totalMs += ms;
    }
    if (run.tokens) totalTokens += run.tokens;
    if (run.cost) totalCost += run.cost;
  }
  return { count: runs.length, totalMs, totalTokens, totalCost };
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
