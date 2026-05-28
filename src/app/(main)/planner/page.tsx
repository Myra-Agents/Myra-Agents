"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePlanner } from "@/hooks/use-planner";
import { useKanban } from "@/hooks/use-kanban";
import type { PlannedTask } from "@/types/planner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SparklesIcon, PlusIcon, Loader2Icon, ClipboardListIcon } from "lucide-react";

export default function PlannerPage() {
  const t = useTranslations("planner");
  const { generate, generating, error, clearError } = usePlanner();
  const { addCard } = useKanban();

  const [objectives, setObjectives] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [drafts, setDrafts] = useState<PlannedTask[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!objectives.trim()) return;
    clearError();
    const tasks = await generate(objectives, workingDir || undefined);
    setDrafts(tasks);
    setSelected(new Set(tasks.map((_, i) => i)));
  }, [objectives, workingDir, generate, clearError]);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCreateAll = useCallback(async () => {
    setCreating(true);
    try {
      for (const idx of Array.from(selected).sort()) {
        const draft = drafts[idx];
        await addCard({
          title: draft.title,
          description: draft.description,
          agentPrompt: draft.agentPrompt,
          tags: draft.tags,
          status: "todo",
        });
      }
      setDrafts([]);
      setSelected(new Set());
      setObjectives("");
    } finally {
      setCreating(false);
    }
  }, [selected, drafts, addCard]);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <ClipboardListIcon className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="objectives">{t("objectivesLabel")}</Label>
            <Textarea
              id="objectives"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder={t("objectivesPlaceholder")}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="working-dir">
              {t("workingDirectory")} <span className="text-muted-foreground font-normal">({t("optional")})</span>
            </Label>
            <Input
              id="working-dir"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="C:\projects\my-app"
            />
          </div>

          <Button onClick={handleGenerate} disabled={generating || !objectives.trim()}>
            {generating ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <SparklesIcon className="size-3.5" />
                {t("generatePlan")}
              </>
            )}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("generatedTasks", { selected: selected.size, total: drafts.length })}
            </h2>
            <Button size="sm" onClick={handleCreateAll} disabled={creating || selected.size === 0}>
              {creating ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              {t("createCards", { count: selected.size })}
            </Button>
          </div>

          {drafts.map((draft, idx) => (
            <Card key={idx} className={!selected.has(idx) ? "opacity-50" : ""}>
              <CardContent className="flex items-start gap-3 p-3">
                <Checkbox
                  checked={selected.has(idx)}
                  onCheckedChange={() => toggleSelect(idx)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium">{draft.title}</p>
                  {draft.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{draft.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {draft.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
