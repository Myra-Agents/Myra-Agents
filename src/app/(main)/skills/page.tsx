"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { DownloadIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSkills } from "@/hooks/use-skills";
import { type MarketplaceSkill, SKILL_MARKETPLACE, type Skill, type SkillInput } from "@/types/skill";

const EMPTY_FORM: SkillInput = { name: "", description: "", content: "", category: "" };

/**
 * Handles the `myra://skill/install?id=<id>` deep link: the Rust handler routes
 * it to `/skills?install=<id>`, and this listener installs the matching
 * marketplace entry into the local library (idempotently), confirms with a
 * toast, then strips the query so a reload doesn't re-fire. Rendered inside a
 * Suspense boundary because `useSearchParams` bails out of static prerender.
 */
function MarketplaceInstallListener() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const { installFromMarketplace } = useSkills();
  const installId = params.get("install");
  const handled = useRef(false);

  useEffect(() => {
    if (!installId || handled.current) return;
    handled.current = true;
    const entry = SKILL_MARKETPLACE.find((e) => e.id === installId);
    if (entry) {
      installFromMarketplace(entry);
      toast.success(t("toast.installed", { name: entry.name }));
    }
    router.replace("/skills");
  }, [installId, installFromMarketplace, router, t]);

  return null;
}

export default function SkillsPage() {
  return (
    <>
      <Suspense fallback={null}>
        <MarketplaceInstallListener />
      </Suspense>
      <SkillsLibrary />
    </>
  );
}

function SkillsLibrary() {
  const t = useTranslations("skills");
  const { skills, addSkill, updateSkill, deleteSkill, installFromMarketplace, isInstalled } = useSkills();

  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Skill | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    setCreating(true);
  }, []);

  const openEdit = useCallback((skill: Skill) => {
    setCreating(false);
    setEditing(skill);
  }, []);

  const closeDialog = useCallback(() => {
    setEditing(null);
    setCreating(false);
  }, []);

  const handleSubmit = useCallback(
    (input: SkillInput) => {
      if (editing) {
        updateSkill(editing.id, input);
        toast.success(t("toast.updated"));
      } else {
        addSkill(input);
        toast.success(t("toast.created"));
      }
      closeDialog();
    },
    [editing, updateSkill, addSkill, closeDialog, t],
  );

  const handleInstall = useCallback(
    (entry: MarketplaceSkill) => {
      installFromMarketplace(entry);
      toast.success(t("toast.installed", { name: entry.name }));
    },
    [installFromMarketplace, t],
  );

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    deleteSkill(pendingDelete.id);
    toast.success(t("toast.deleted"));
    setPendingDelete(null);
  }, [pendingDelete, deleteSkill, t]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SparklesIcon className="size-5 text-muted-foreground" />
          <div>
            <h1 className="font-semibold text-xl tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="mine" className="w-full">
        <TabsList variant="line">
          <TabsTrigger value="mine">{t("tabs.mine", { count: skills.length })}</TabsTrigger>
          <TabsTrigger value="marketplace">{t("tabs.marketplace")}</TabsTrigger>
        </TabsList>

        {/* ── My skills ─────────────────────────────────────────────── */}
        <TabsContent value="mine" className="mt-4 flex flex-col gap-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}>
              <PlusIcon className="size-4" />
              {t("newSkill")}
            </Button>
          </div>

          {skills.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <SparklesIcon className="size-6 text-muted-foreground" />
                <p className="font-medium">{t("empty.title")}</p>
                <p className="max-w-sm text-muted-foreground text-sm">{t("empty.description")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {skills.map((skill) => (
                <Card key={skill.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{skill.name}</CardTitle>
                        <CardDescription className="line-clamp-2">{skill.description}</CardDescription>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("editSkill")}
                          onClick={() => openEdit(skill)}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("deleteSkill")}
                          onClick={() => setPendingDelete(skill)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-wrap items-center gap-2">
                    {skill.category ? <Badge variant="secondary">{skill.category}</Badge> : null}
                    <Badge variant="outline">
                      {skill.source === "marketplace" ? t("badge.marketplace") : t("badge.custom")}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Marketplace ───────────────────────────────────────────── */}
        <TabsContent value="marketplace" className="mt-4 flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">{t("marketplaceIntro")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SKILL_MARKETPLACE.map((entry) => {
              const installed = isInstalled(entry.id);
              return (
                <Card key={entry.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none" aria-hidden>
                        {entry.icon}
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{entry.name}</CardTitle>
                        <CardDescription className="line-clamp-2">{entry.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{entry.category}</Badge>
                      <span className="text-muted-foreground text-xs">{t("by", { author: entry.author })}</span>
                    </div>
                    <Button
                      size="sm"
                      variant={installed ? "outline" : "default"}
                      disabled={installed}
                      onClick={() => handleInstall(entry)}
                    >
                      {installed ? (
                        t("installed")
                      ) : (
                        <>
                          <DownloadIcon className="size-4" />
                          {t("install")}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <SkillDialog
        open={creating || editing !== null}
        skill={editing}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        t={t}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDelete.description", { name: pendingDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirmDelete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("confirmDelete.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SkillDialog({
  open,
  skill,
  onClose,
  onSubmit,
  t,
}: {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
  onSubmit: (input: SkillInput) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [form, setForm] = useState<SkillInput>(EMPTY_FORM);

  // Reseed the form each time the dialog opens (create → blank, edit → the skill),
  // adjusting state during render on the open/identity transition (React's
  // "store info from previous renders" pattern) so typed edits aren't clobbered.
  const seedKey = open ? (skill?.id ?? "new") : "closed";
  const seededKey = useRef("closed");
  if (seededKey.current !== seedKey) {
    seededKey.current = seedKey;
    if (open) {
      setForm(
        skill
          ? { name: skill.name, description: skill.description, content: skill.content, category: skill.category ?? "" }
          : EMPTY_FORM,
      );
    }
  }

  const canSave = form.name.trim().length > 0 && form.content.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSubmit({
      name: form.name.trim(),
      description: form.description.trim(),
      content: form.content.trim(),
      category: form.category?.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{skill ? t("editSkill") : t("newSkill")}</DialogTitle>
          <DialogDescription>{t("form.hint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-name">{t("form.name")}</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("form.namePlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="skill-category">{t("form.category")}</Label>
              <Input
                id="skill-category"
                value={form.category ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={t("form.categoryPlaceholder")}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-description">{t("form.description")}</Label>
            <Input
              id="skill-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("form.descriptionPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skill-content">{t("form.content")}</Label>
            <Textarea
              id="skill-content"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder={t("form.contentPlaceholder")}
              spellCheck={false}
              className="min-h-[180px] font-mono text-[12px]"
            />
            <span className="text-muted-foreground text-xs">{t("form.contentHint")}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button disabled={!canSave} onClick={submit}>
            {t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
