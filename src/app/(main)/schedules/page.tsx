"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSchedules } from "@/hooks/use-schedules";
import type { ScheduledTask, CreateScheduleInput, UpdateScheduleInput, ScheduleKind, ScheduleKindType } from "@/types/schedule";
import { describeSchedule, formatHm, defaultScheduleKind } from "@/types/schedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusIcon, PlayIcon, TrashIcon, PencilIcon, ClockIcon } from "lucide-react";

export default function SchedulesPage() {
  const t = useTranslations("schedules");
  const {
    schedules,
    loading,
    error,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    toggleEnabled,
    triggerNow,
  } = useSchedules();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  const handleNew = useCallback(() => {
    setEditingTask(null);
    setEditModalOpen(true);
  }, []);

  const handleEdit = useCallback((task: ScheduledTask) => {
    setEditingTask(task);
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
            <Card key={task.id} className={!task.enabled ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-4 p-4">
                <Switch
                  checked={task.enabled}
                  onCheckedChange={(v) => toggleEnabled(task.id, v)}
                />
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

      <ScheduleEditModal
        open={editModalOpen}
        task={editingTask}
        onSave={handleSave}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  );
}

interface ScheduleEditModalProps {
  open: boolean;
  task: ScheduledTask | null;
  onSave: (input: CreateScheduleInput | UpdateScheduleInput) => Promise<void>;
  onClose: () => void;
}

function ScheduleEditModal({ open, task, onSave, onClose }: ScheduleEditModalProps) {
  const t = useTranslations("schedules");
  const [name, setName] = useState(task?.name ?? "");
  const [cardTitle, setCardTitle] = useState(task?.cardTitle ?? "");
  const [cardDescription, setCardDescription] = useState(task?.cardDescription ?? "");
  const [agentPrompt, setAgentPrompt] = useState(task?.agentPrompt ?? "");
  const [tags, setTags] = useState(task?.tags.join(", ") ?? "");
  const [kindType, setKindType] = useState<ScheduleKindType>(task?.schedule.type ?? "daily");
  const [schedule, setSchedule] = useState<ScheduleKind>(task?.schedule ?? defaultScheduleKind("daily"));
  const [enabled, setEnabled] = useState(task?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const handleKindChange = (type: ScheduleKindType) => {
    setKindType(type);
    setSchedule(defaultScheduleKind(type));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cardTitle.trim()) return;
    setSaving(true);
    try {
      const input: CreateScheduleInput = {
        name: name.trim(),
        cardTitle: cardTitle.trim(),
        cardDescription,
        agentPrompt,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        schedule,
        enabled,
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? t("editSchedule") : t("newSchedule")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("form.scheduleName")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("form.scheduleNamePlaceholder")} required />
          </div>

          <div className="space-y-2">
            <Label>{t("form.cardTitle")} *</Label>
            <Input value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} placeholder={t("form.cardTitlePlaceholder")} required />
          </div>

          <div className="space-y-2">
            <Label>{t("form.description")}</Label>
            <Textarea value={cardDescription} onChange={(e) => setCardDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>{t("form.agentPrompt")}</Label>
            <Textarea value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} rows={3} className="font-mono text-xs" />
          </div>

          <div className="space-y-2">
            <Label>{t("form.tags")}</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("form.tagsPlaceholder")} />
          </div>

          <div className="space-y-2">
            <Label>{t("form.scheduleKind")}</Label>
            <Select value={kindType} onValueChange={(v) => handleKindChange(v as ScheduleKindType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">{t("kind.once")}</SelectItem>
                <SelectItem value="daily">{t("kind.daily")}</SelectItem>
                <SelectItem value="weekly">{t("kind.weekly")}</SelectItem>
                <SelectItem value="interval">{t("kind.interval")}</SelectItem>
                <SelectItem value="cron">{t("kind.cron")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScheduleKindFields schedule={schedule} onChange={setSchedule} />

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>{t("enabled")}</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("actions.cancel")}</Button>
            <Button type="submit" disabled={!name.trim() || !cardTitle.trim() || saving}>
              {saving ? t("actions.saving") : task ? t("actions.update") : t("actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleKindFields({ schedule, onChange }: { schedule: ScheduleKind; onChange: (s: ScheduleKind) => void }) {
  const t = useTranslations("schedules");
  const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  switch (schedule.type) {
    case "once":
      return (
        <div className="space-y-2">
          <Label>{t("form.dateTime")}</Label>
          <Input type="datetime-local" value={schedule.at} onChange={(e) => onChange({ type: "once", at: e.target.value })} />
        </div>
      );
    case "daily":
      return (
        <div className="space-y-2">
          <Label>{t("form.time")}</Label>
          <Input type="time" value={schedule.time} onChange={(e) => onChange({ type: "daily", time: e.target.value })} />
        </div>
      );
    case "weekly":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("form.time")}</Label>
            <Input type="time" value={schedule.time} onChange={(e) => onChange({ ...schedule, time: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("form.days")}</Label>
            <div className="flex gap-1 flex-wrap">
              {weekdays.map((dayKey, i) => {
                const dayNum = i + 1;
                const active = schedule.days.includes(dayNum);
                return (
                  <Button key={dayKey} type="button" size="xs" variant={active ? "default" : "outline"} onClick={() => {
                    const days = active ? schedule.days.filter((d) => d != dayNum) : [...schedule.days, dayNum].sort();
                    onChange({ ...schedule, days });
                  }}>
                    {t(`days.${dayKey}`)}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      );
    case "interval":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("form.startTime")}</Label>
            <Input type="time" value={schedule.start} onChange={(e) => onChange({ ...schedule, start: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("form.minutes")}</Label>
            <Input type="number" min={1} value={schedule.minutes} onChange={(e) => onChange({ ...schedule, minutes: Number(e.target.value) || 60 })} />
          </div>
        </div>
      );
    case "cron":
      return (
        <div className="space-y-2">
          <Label>{t("form.cronExpression")}</Label>
          <Input value={schedule.expr} onChange={(e) => onChange({ type: "cron", expr: e.target.value })} placeholder={t("form.cronPlaceholder")} className="font-mono text-xs" />
        </div>
      );
  }
}
