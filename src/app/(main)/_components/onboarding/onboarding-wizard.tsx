"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  KanbanIcon,
  KeyIcon,
  RocketIcon,
  SparklesIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { WorkingDirField } from "@/components/agents/working-dir-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MyraMark } from "@/components/ui/myra-mark";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/hooks/use-settings";
import { getHomeFolderSetting, osHomeDir, setHomeFolderSetting } from "@/lib/home-folder.client";
import { completeOnboarding } from "@/lib/onboarding.client";
import { track } from "@/lib/posthog/events";
import { openExternal } from "@/lib/tauri";

/** Where users mint an OpenRouter key + browse model ids. */
const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";

type StepId = "welcome" | "agent" | "connect" | "folder" | "ready";

const STEP_ORDER: StepId[] = ["welcome", "agent", "connect", "folder", "ready"];

interface OnboardingWizardProps {
  /** Called once the wizard is dismissed (finished or skipped) so the host can unmount it. */
  onClose: () => void;
}

/**
 * First-run wizard. Walks a new user from "what is this" to a runnable setup:
 * welcome → confirm the built-in agent → connect an OpenRouter key + model →
 * pick a working folder → ready. Gating (localStorage flag) lives in
 * {@link OnboardingBootstrap}; this component renders the flow and persists the
 * folder choice, the embedded LLM connection, and completion.
 */
export function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  const { settings, save, loading: settingsLoading } = useSettings();
  const [stepIndex, setStepIndex] = useState(0);
  const [homeFolder, setHomeFolder] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [seededLlm, setSeededLlm] = useState(false);

  // Seed the OpenRouter fields once, after settings finish loading, from any
  // already-saved embedded LLM config (don't seed from DEFAULT_SETTINGS).
  useEffect(() => {
    if (settingsLoading || seededLlm) return;
    const llm = settings.embeddedLlm;
    if (llm?.apiKey) setApiKey(llm.apiKey);
    if (llm?.model) setModel(llm.model);
    setSeededLlm(true);
  }, [settingsLoading, settings.embeddedLlm, seededLlm]);

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
      // Persist the OpenRouter connection too when anything was entered. save()
      // round-trips through the sidecar; swallow failures (e.g. browser dev mode)
      // so a dead backend never traps the user in the wizard.
      const key = apiKey.trim();
      const modelId = model.trim();
      if (key || modelId) {
        void save({
          ...settings,
          embeddedLlm: { ...settings.embeddedLlm, apiKey: key || undefined, model: modelId || undefined },
        }).catch(() => {
          /* backend unreachable (e.g. browser dev) — non-fatal for onboarding */
        });
      }
      completeOnboarding();
      track(skipped ? "onboarding_skipped" : "onboarding_completed", { last_step: stepId });
      onClose();
    },
    [homeFolder, apiKey, model, settings, save, stepId, onClose],
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

        <div className="flex max-h-[85vh] min-h-[22rem] flex-col overflow-y-auto p-6">
          <StepBody
            stepId={stepId}
            t={t}
            homeFolder={homeFolder}
            setHomeFolder={setHomeFolder}
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
          />

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
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
}

function StepBody({ stepId, t, homeFolder, setHomeFolder, apiKey, setApiKey, model, setModel }: StepBodyProps) {
  if (stepId === "welcome") return <WelcomeStep t={t} />;
  if (stepId === "agent") return <AgentStep t={t} />;
  if (stepId === "connect")
    return <ConnectStep t={t} apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />;
  if (stepId === "folder") return <FolderStep t={t} homeFolder={homeFolder} setHomeFolder={setHomeFolder} />;
  return <ReadyStep t={t} homeFolder={homeFolder} apiKey={apiKey} model={model} />;
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

/**
 * Connect step. The embedded agent runs on an LLM; for now that means bringing
 * an OpenRouter key + a model id (the Myra hub cascade isn't the default yet).
 * Both fields are optional here — persisted on finish — with an animated GIF
 * showing where the model id lives on openrouter.ai. Values are lifted to the
 * wizard so {@link OnboardingWizard.finish} can save them to the embedded config.
 */
function ConnectStep({
  t,
  apiKey,
  setApiKey,
  model,
  setModel,
}: {
  t: ReturnType<typeof useTranslations>;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <StepHeading icon={<KeyIcon />} title={t("connect.title")} description={t("connect.description")} />

      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="onboarding-openrouter-key" className="font-medium text-sm text-text-primary">
              {t("connect.keyLabel")}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto gap-1 px-1.5 py-0.5 text-primary text-xs"
              onClick={() => void openExternal(OPENROUTER_KEYS_URL)}
            >
              {t("connect.getKey")}
              <ExternalLinkIcon className="size-3" />
            </Button>
          </div>
          <Input
            id="onboarding-openrouter-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={t("connect.keyPlaceholder")}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="onboarding-openrouter-model" className="font-medium text-sm text-text-primary">
            {t("connect.modelLabel")}
          </label>
          <Input
            id="onboarding-openrouter-model"
            autoComplete="off"
            spellCheck={false}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={t("connect.modelPlaceholder")}
          />
        </div>
      </div>

      {/* Animated walkthrough: where the model id lives on openrouter.ai. */}
      <figure className="space-y-1.5 overflow-hidden rounded-lg border border-border-cards bg-card-background">
        {/* biome-ignore lint/performance/noImgElement: static onboarding asset, not user content */}
        <img
          src="/onboarding/openrouter-model.gif"
          alt={t("connect.gifAlt")}
          className="w-full"
          width={760}
          height={291}
        />
        <figcaption className="px-3 pb-2 text-text-tertiary text-xs leading-relaxed">
          {t.rich("connect.gifCaption", {
            link: (chunks) => (
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => void openExternal(OPENROUTER_MODELS_URL)}
              >
                {chunks}
              </button>
            ),
          })}
        </figcaption>
      </figure>
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

function ReadyStep({
  t,
  homeFolder,
  apiKey,
  model,
}: {
  t: ReturnType<typeof useTranslations>;
  homeFolder: string;
  apiKey: string;
  model: string;
}) {
  const modelId = model.trim();
  const rows: { key: string; label: string; ok: boolean; value?: string }[] = [
    {
      key: "agent",
      // The built-in agent needs no install, so it's always ready at this point.
      label: t("ready.agentRow"),
      ok: true,
      value: t("agent.builtIn"),
    },
    {
      key: "model",
      label: t("ready.modelRow"),
      // A concrete model id is what makes the OpenRouter connection usable.
      ok: modelId.length > 0,
      value: modelId || (apiKey.trim() ? t("ready.modelUnset") : t("ready.modelHub")),
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
