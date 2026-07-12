"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  FolderOpenIcon,
  KanbanIcon,
  RocketIcon,
  SparklesIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { WorkingDirField } from "@/components/agents/working-dir-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MyraMark } from "@/components/ui/myra-mark";
import { Progress } from "@/components/ui/progress";
import { getHomeFolderSetting, osHomeDir, setHomeFolderSetting } from "@/lib/home-folder.client";
import { completeOnboarding } from "@/lib/onboarding.client";
import { track } from "@/lib/posthog/events";

type StepId = "welcome" | "agent" | "folder" | "ready";

const STEP_ORDER: StepId[] = ["welcome", "agent", "folder", "ready"];

interface OnboardingWizardProps {
  /** Called once the wizard is dismissed (finished or skipped) so the host can unmount it. */
  onClose: () => void;
}

/**
 * First-run wizard. Walks a new user from "what is this" to a runnable setup:
 * welcome → confirm the built-in agent → pick a working folder → ready. Gating
 * (localStorage flag) lives in {@link OnboardingBootstrap}; this component just
 * renders the flow and persists the folder choice + completion.
 */
export function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  const [stepIndex, setStepIndex] = useState(0);
  const [homeFolder, setHomeFolder] = useState("");

  // Seed the folder field from the saved setting, falling back to the OS home dir.
  useEffect(() => {
    let cancelled = false;
    const existing = getHomeFolderSetting();
    if (existing) {
      setHomeFolder(existing);
      return;
    }
    void osHomeDir().then((dir) => {
      if (!cancelled && dir) setHomeFolder(dir);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    track("onboarding_started");
  }, []);

  const stepId = STEP_ORDER[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEP_ORDER.length - 1;
  const progress = useMemo(() => ((stepIndex + 1) / STEP_ORDER.length) * 100, [stepIndex]);

  const finish = useCallback(
    (skipped: boolean) => {
      // Persist the folder choice regardless of how they leave — a set folder is
      // useful even for a skipper.
      if (homeFolder.trim()) setHomeFolderSetting(homeFolder);
      completeOnboarding();
      track(skipped ? "onboarding_skipped" : "onboarding_completed", { last_step: stepId });
      onClose();
    },
    [homeFolder, stepId, onClose],
  );

  const goNext = useCallback(() => {
    track("onboarding_step_completed", { step: stepId });
    if (isLast) {
      finish(false);
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }, [stepId, isLast, finish]);

  const goBack = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // Closing via the X or Escape counts as skipping.
        if (!next) finish(true);
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        {/* Radix requires a title for screen readers; the visible heading is per-step. */}
        <DialogTitle className="sr-only">{t(`${stepId}.title`)}</DialogTitle>
        {/* Progress rail across the very top. */}
        <Progress value={progress} className="h-1 rounded-none" />

        <div className="flex min-h-[22rem] flex-col p-6">
          <StepBody stepId={stepId} t={t} homeFolder={homeFolder} setHomeFolder={setHomeFolder} />

          <div className="mt-auto flex items-center justify-between pt-6">
            <div className="flex items-center gap-1.5">
              {STEP_ORDER.map((id, i) => (
                <span
                  key={id}
                  aria-hidden
                  className={
                    i === stepIndex
                      ? "size-1.5 rounded-full bg-primary"
                      : i < stepIndex
                        ? "size-1.5 rounded-full bg-primary/40"
                        : "size-1.5 rounded-full bg-muted-foreground/25"
                  }
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {isFirst ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => finish(true)}>
                  {t("skip")}
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={goBack}>
                  <ArrowLeftIcon />
                  {t("back")}
                </Button>
              )}
              <Button type="button" size="sm" onClick={goNext}>
                {isLast ? (
                  <>
                    {t("getStarted")}
                    <RocketIcon />
                  </>
                ) : (
                  <>
                    {t("next")}
                    <ArrowRightIcon />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface StepBodyProps {
  stepId: StepId;
  t: ReturnType<typeof useTranslations>;
  homeFolder: string;
  setHomeFolder: (value: string) => void;
}

function StepBody({ stepId, t, homeFolder, setHomeFolder }: StepBodyProps) {
  if (stepId === "welcome") return <WelcomeStep t={t} />;
  if (stepId === "agent") return <AgentStep t={t} />;
  if (stepId === "folder") return <FolderStep t={t} homeFolder={homeFolder} setHomeFolder={setHomeFolder} />;
  return <ReadyStep t={t} homeFolder={homeFolder} />;
}

function StepHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="space-y-3">
      <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-icon-primary [&_svg]:size-5">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h2 className="font-semibold text-lg text-text-primary tracking-tight">{title}</h2>
        <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function WelcomeStep({ t }: { t: ReturnType<typeof useTranslations> }) {
  const flow = ["draft", "todo", "inProgress", "review", "done"] as const;
  return (
    <div className="space-y-5">
      <StepHeading icon={<SparklesIcon />} title={t("welcome.title")} description={t("welcome.description")} />
      <ul className="space-y-2.5">
        {(["board", "agents", "patrols"] as const).map((key) => (
          <li key={key} className="flex items-start gap-2.5 text-sm text-text-secondary">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{t(`welcome.points.${key}`)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 p-3">
        {flow.map((stage, i) => (
          <span key={stage} className="flex items-center gap-1.5">
            <Badge variant="outline" className="font-normal text-text-tertiary">
              {t(`welcome.flow.${stage}`)}
            </Badge>
            {i < flow.length - 1 && <ArrowRightIcon className="size-3 text-muted-foreground/50" />}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Agent step. Myra ships a built-in embedded agent ("myra-embedded") that needs
 * no CLI install — so onboarding just confirms it's ready rather than pushing a
 * download. Bringing your own CLI (opencode, Claude, …) stays an optional,
 * never-forced choice surfaced as a footnote pointing at Settings.
 */
function AgentStep({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="space-y-5">
      <StepHeading icon={<MyraMark />} title={t("agent.title")} description={t("agent.description")} />

      <div className="rounded-lg border border-border-cards bg-card-background p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-secondary text-icon-primary [&_svg]:size-4">
              <MyraMark />
            </div>
            <div className="leading-tight">
              <p className="font-medium text-sm text-text-primary">{t("agent.name")}</p>
              <p className="text-text-tertiary text-xs">{t("agent.cardDescription")}</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 border-green-500/30 bg-green-500/10 text-green-600">
            <CheckIcon className="size-3" />
            {t("agent.builtIn")}
          </Badge>
        </div>
      </div>

      <p className="text-text-tertiary text-xs leading-relaxed">{t("agent.footnote")}</p>
    </div>
  );
}

function FolderStep({
  t,
  homeFolder,
  setHomeFolder,
}: {
  t: ReturnType<typeof useTranslations>;
  homeFolder: string;
  setHomeFolder: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <StepHeading icon={<FolderOpenIcon />} title={t("folder.title")} description={t("folder.description")} />
      <div className="space-y-2">
        <WorkingDirField value={homeFolder} onChange={setHomeFolder} placeholder={t("folder.placeholder")} />
        <p className="text-text-tertiary text-xs leading-relaxed">{t("folder.hint")}</p>
      </div>
    </div>
  );
}

function ReadyStep({ t, homeFolder }: { t: ReturnType<typeof useTranslations>; homeFolder: string }) {
  const rows: { key: string; label: string; ok: boolean; value?: string }[] = [
    {
      key: "agent",
      // The built-in agent needs no install, so it's always ready at this point.
      label: t("ready.agentRow"),
      ok: true,
      value: t("agent.builtIn"),
    },
    {
      key: "folder",
      label: t("ready.folderRow"),
      ok: homeFolder.trim().length > 0,
      value: homeFolder.trim() || t("ready.folderUnset"),
    },
  ];

  return (
    <div className="space-y-5">
      <StepHeading icon={<KanbanIcon />} title={t("ready.title")} description={t("ready.description")} />
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border-cards bg-card-background px-3 py-2.5"
          >
            <span className="flex items-center gap-2.5 text-sm text-text-primary">
              <span
                className={
                  row.ok
                    ? "flex size-5 items-center justify-center rounded-full bg-green-500/15 text-green-600 [&_svg]:size-3"
                    : "flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-3"
                }
              >
                {row.ok ? <CheckIcon /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              {row.label}
            </span>
            <span className="max-w-[9rem] truncate font-mono text-text-tertiary text-xs" title={row.value}>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-text-secondary leading-relaxed">{t("ready.cta")}</p>
    </div>
  );
}
