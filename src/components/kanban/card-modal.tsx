"use client";

import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FolderIcon, RotateCcwIcon, XIcon, ZapIcon } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { normalizeTag, tagClassName } from "@/lib/kanban-tags";
import { cn } from "@/lib/utils";
import type { CardFormData, CardTemplate, KanbanCard, KanbanStatus } from "@/types/kanban";
import { COLUMN_CONFIG, CREATABLE_STATUSES } from "@/types/kanban";
import type { AgentPreset } from "@/types/settings";

const NO_TEMPLATE = "__none";

interface CardModalProps {
  open: boolean;
  mode: "add" | "edit";
  initialStatus?: KanbanStatus;
  card?: KanbanCard;
  availableTags?: string[];
  templates?: CardTemplate[];
  agentPresets?: AgentPreset[];
  defaultAgentId?: string;
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
  onSave,
  onSaveTemplate,
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
  const [selectedTemplateId, setSelectedTemplateId] = useState(NO_TEMPLATE);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const { connections, primaryId } = useConnections();
  const [targetConnId, setTargetConnId] = useState(primaryId);

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
      setSelectedTemplateId(NO_TEMPLATE);
      setTemplateName("");
      setTargetConnId(primaryId);
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open, card, initialStatus, defaultAgentId, agentPresets, primaryId]);

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

  const handlePresetChange = (value: string) => {
    setAgentPresetId(value);
    // Card-level overrides belong to the previous preset — drop them so the
    // options editor falls back to the newly selected preset's defaults.
    setAgentFlags(undefined);
    setUseWorktree(undefined);
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

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name || !onSaveTemplate) return;
    onSaveTemplate({
      name,
      description,
      agentPrompt,
      tags: tagList,
      agentPresetId: agentPresetId || undefined,
    });
    setTemplateName("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
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

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>{mode === "add" ? t("newTitle") : t("editTitle")}</DialogTitle>
          <DialogDescription>{mode === "add" ? t("newDescription") : t("editDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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

            {mode === "add" && (
              <div className="space-y-2">
                <Label>{t("column")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CREATABLE_STATUSES.map((item) => {
                    const cfg = COLUMN_CONFIG[item];
                    const isSelected = status === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setStatus(item)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2 font-medium text-xs transition-colors",
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        <div className={`h-2 w-2 rounded-full ${cfg.accentBar}`} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
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
              <Label htmlFor="card-tags">{t("tags")}</Label>
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
              <div className="space-y-2">
                <Label>{t("agentPreset")}</Label>
                <Select value={agentPresetId} onValueChange={handlePresetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("agentPresetPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {agentPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPreset && (
                  <AgentOptions
                    binary={selectedPreset.binary}
                    flags={agentFlags ?? selectedPreset.flags ?? []}
                    useWorktree={useWorktree ?? selectedPreset.useWorktree ?? false}
                    onFlagsChange={setAgentFlags}
                    onWorktreeChange={setUseWorktree}
                  />
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
              <Label htmlFor="card-prompt" className="flex items-center gap-2">
                <Badge className="border-orange-500/20 bg-orange-500/10 text-[10px] text-orange-600">
                  <ZapIcon className="size-2.5" />
                  {t("agent")}
                </Badge>
                {t("prompt")}
                <span className="font-normal text-muted-foreground">({t("optional")})</span>
              </Label>
              <Textarea
                id="card-prompt"
                value={agentPrompt}
                onChange={(event) => setAgentPrompt(event.target.value)}
                placeholder={t("promptPlaceholder")}
                rows={4}
                className="font-mono text-xs"
              />
            </div>

            {onSaveTemplate && (
              <div className="rounded-lg border bg-foreground/5 p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder={t("templateNamePlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim()}
                  >
                    {t("saveTemplate")}
                  </Button>
                </div>
              </div>
            )}

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
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            {canRelaunch && (
              <Button type="button" variant="secondary" onClick={handleRelaunch} disabled={launching || saving}>
                <RotateCcwIcon className="size-3.5" />
                {launching ? t("relaunching") : t("relaunch")}
              </Button>
            )}
            <Button type="submit" disabled={!title.trim() || saving}>
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
