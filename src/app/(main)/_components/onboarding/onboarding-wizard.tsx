"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CompassIcon,
  CpuIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  HandIcon,
  KanbanIcon,
  KeyIcon,
  Loader2Icon,
  MonitorIcon,
  MoonIcon,
  PlugZapIcon,
  RocketIcon,
  SlidersHorizontalIcon,
  SunIcon,
  TerminalIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useBinaryStatus } from "@/components/agents/binary-status";
import { LocalModelManager } from "@/components/agents/ollama-local-models";
import { WorkingDirField } from "@/components/agents/working-dir-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MyraMark } from "@/components/ui/myra-mark";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOllama } from "@/hooks/use-ollama";
import { useSettings } from "@/hooks/use-settings";
import { useTheme } from "@/hooks/use-theme";
import { getStoredLocale, setAppLocale } from "@/i18n/provider";
import { getHomeFolderSetting, osHomeDir, setHomeFolderSetting } from "@/lib/home-folder.client";
import { completeOnboarding } from "@/lib/onboarding.client";
import { track } from "@/lib/posthog/events";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { invoke, isDevModeError, openExternal } from "@/lib/tauri";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { useTourStore } from "@/stores/tour-store";
import { type AppSettings, DEFAULT_AGENT_PRESETS, type EmbeddedLlmProvider } from "@/types/settings";

type AppLocale = AppSettings["locale"];
type AppTheme = AppSettings["theme"];

/** Where users mint an OpenRouter key + browse model ids. */
const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";
/** Docs for the local-models runtime we offer to install. */
const OLLAMA_URL = "https://ollama.com";

/** CLI agents we probe for on the agent step — the shipped presets. Detected
 * ones are listed with their version; missing ones are shown muted (never a
 * forced install). */
const DETECTABLE_AGENTS = DEFAULT_AGENT_PRESETS.map((p) => ({ binary: p.binary, name: p.name }));

type StepId = "welcome" | "preferences" | "agent" | "connect" | "folder" | "ready";

const STEP_ORDER: StepId[] = ["welcome", "preferences", "agent", "connect", "folder", "ready"];

interface OnboardingWizardProps {
  /** Called once the wizard is dismissed (finished or skipped) so the host can unmount it. */
  onClose: () => void;
}

/**
 * First-run wizard. Walks a new user from "what is this" to a runnable setup:
 * welcome → confirm the built-in agent (+ detect CLI agents) → connect a model
 * (cloud OpenRouter or a local Ollama the step can install) → pick a working
 * folder → ready. Gating (localStorage flag) lives in {@link OnboardingBootstrap};
 * this component renders the flow and persists the folder choice, the embedded
 * LLM connection, and completion.
 */
export function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  const { settings, save, loading: settingsLoading } = useSettings();
  const startTour = useTourStore((s) => s.start);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const [stepIndex, setStepIndex] = useState(0);
  // Seeded from what's already in effect (localStorage), not from settings —
  // the language is live before the sidecar has answered.
  const [locale, setLocale] = useState<AppLocale>(() => getStoredLocale());
  const [homeFolder, setHomeFolder] = useState("");
  const [provider, setProvider] = useState<EmbeddedLlmProvider>("cloud");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [seededLlm, setSeededLlm] = useState(false);

  // Seed the LLM fields once, after settings finish loading, from any
  // already-saved embedded LLM config (don't seed from DEFAULT_SETTINGS).
  useEffect(() => {
    if (settingsLoading || seededLlm) return;
    const llm = settings.embeddedLlm;
    if (llm?.provider) setProvider(llm.provider);
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
    (skipped: boolean, guided = false) => {
      // Persist the folder choice regardless of how they leave — a set folder is
      // useful even for a skipper.
      if (homeFolder.trim()) setHomeFolderSetting(homeFolder);
      const key = apiKey.trim();
      const modelId = model.trim();
      // Ollama needs a model; cloud is usable with just a key OR model.
      const hasLlm = (provider === "ollama" && modelId) || Boolean(key) || Boolean(modelId);
      // One round-trip for everything. Language and theme already took effect
      // (localStorage + cookie) the moment they were picked, so this only
      // mirrors them into settings; swallow failures (e.g. browser dev mode) so
      // a dead backend never traps the user in the wizard.
      void save({
        ...settings,
        locale,
        theme: themeMode,
        ...(hasLlm
          ? {
              embeddedLlm: {
                ...settings.embeddedLlm,
                provider,
                // The key only applies to the cloud provider; drop it for Ollama.
                apiKey: provider === "cloud" ? key || undefined : undefined,
                model: modelId || undefined,
              },
            }
          : {}),
      }).catch(() => {
        /* backend unreachable (e.g. browser dev) — non-fatal for onboarding */
      });
      // Opting in here is what makes the sidebar "Get started" checklist appear.
      if (guided) startTour();
      completeOnboarding();
      track(skipped ? "onboarding_skipped" : "onboarding_completed", { last_step: stepId, guided });
      onClose();
    },
    [homeFolder, locale, themeMode, provider, apiKey, model, settings, save, stepId, onClose, startTour],
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
            locale={locale}
            setLocale={setLocale}
            homeFolder={homeFolder}
            setHomeFolder={setHomeFolder}
            provider={provider}
            setProvider={setProvider}
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
              {/* Offered only at the end — the checklist is about the app, and
                  only makes sense once setup is out of the way. */}
              {isLast && (
                <Button type="button" size="sm" variant="outline" onClick={() => finish(false, true)}>
                  <CompassIcon />
                  {t("guideMe")}
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
  locale: AppLocale;
  setLocale: (value: AppLocale) => void;
  homeFolder: string;
  setHomeFolder: (value: string) => void;
  provider: EmbeddedLlmProvider;
  setProvider: (value: EmbeddedLlmProvider) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
}

function StepBody({
  stepId,
  t,
  locale,
  setLocale,
  homeFolder,
  setHomeFolder,
  provider,
  setProvider,
  apiKey,
  setApiKey,
  model,
  setModel,
}: StepBodyProps) {
  if (stepId === "welcome") return <WelcomeStep t={t} />;
  if (stepId === "preferences") return <PreferencesStep t={t} locale={locale} setLocale={setLocale} />;
  if (stepId === "agent") return <AgentStep t={t} />;
  if (stepId === "connect")
    return (
      <ConnectStep
        t={t}
        provider={provider}
        setProvider={setProvider}
        apiKey={apiKey}
        setApiKey={setApiKey}
        model={model}
        setModel={setModel}
      />
    );
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
  return (
    <div className="space-y-5">
      <StepHeading icon={<HandIcon />} title={t("welcome.title")} description={t("welcome.description")} />
    </div>
  );
}

/**
 * Agent step. Myra ships a built-in embedded agent ("myra-embedded") that needs
 * no CLI install — so onboarding just confirms it's ready rather than pushing a
 * download. It ALSO probes the shipped CLI presets ({@link DETECTABLE_AGENTS})
 * and lists any it finds on PATH with their version, so a user who already has
 * e.g. opencode sees it recognised — never a forced install.
 */
/**
 * Language and theme, asked before anything else: they cost one click, they
 * change how the rest of the wizard reads, and both apply live.
 *
 * Each choice takes effect immediately through the same path Settings uses, so
 * it sticks in localStorage/cookie even if the sidecar save on finish fails.
 */
function PreferencesStep({
  t,
  locale,
  setLocale,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: AppLocale;
  setLocale: (value: AppLocale) => void;
}) {
  const { setTheme } = useTheme();
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const themeMode = usePreferencesStore((s) => s.themeMode);

  const applyTheme = useCallback(
    (next: AppTheme) => {
      setTheme(next);
      setThemeMode(next);
      void persistPreference("theme_mode", next);
    },
    [setTheme, setThemeMode],
  );

  const applyLocale = useCallback(
    (next: AppLocale) => {
      setLocale(next);
      // No reload — the provider re-renders in place, so the wizard keeps its
      // step and whatever the user already typed.
      setAppLocale(next);
    },
    [setLocale],
  );

  return (
    <div className="space-y-5">
      <StepHeading
        icon={<SlidersHorizontalIcon />}
        title={t("preferences.title")}
        description={t("preferences.description")}
      />

      <div className="space-y-1.5">
        <Label className="text-xs">{t("preferences.languageLabel")}</Label>
        <Select value={locale} onValueChange={(v) => applyLocale(v as AppLocale)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("preferences.languageAuto")}</SelectItem>
            <SelectItem value="en">{t("preferences.languageEn")}</SelectItem>
            <SelectItem value="fr">{t("preferences.languageFr")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t("preferences.themeLabel")}</Label>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-0.5">
          {(
            [
              { id: "light", icon: SunIcon },
              { id: "dark", icon: MoonIcon },
              { id: "system", icon: MonitorIcon },
            ] as const
          ).map(({ id, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={themeMode === id ? "secondary" : "ghost"}
              className="h-8 gap-1.5"
              onClick={() => applyTheme(id)}
            >
              <Icon className="size-3.5" />
              {t(`preferences.theme${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentStep({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="space-y-5">
      <StepHeading icon={<MyraMark />} title={t("agent.title")} description={t("agent.description")} />

      <div className="space-y-2">
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

        {/* Detected CLI agents already on the machine (e.g. opencode) — listed
            with their version, never installed for the user here. */}
        {DETECTABLE_AGENTS.map((agent) => (
          <DetectedAgentCard key={agent.binary} t={t} binary={agent.binary} name={agent.name} />
        ))}
      </div>

      <p className="text-text-tertiary text-xs leading-relaxed">{t("agent.footnote")}</p>
    </div>
  );
}

/**
 * One CLI-agent row — rendered ONLY when the binary is actually detected on the
 * machine (with its version). A missing (or still-checking) agent renders
 * nothing, so the step stays clean when no extra CLI is installed.
 */
function DetectedAgentCard({
  t,
  binary,
  name,
}: {
  t: ReturnType<typeof useTranslations>;
  binary: string;
  name: string;
}) {
  const { status } = useBinaryStatus(binary);
  if (status?.found !== true) return null;

  return (
    <div className="rounded-lg border border-border-cards bg-card-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-secondary text-icon-primary [&_svg]:size-4">
            <TerminalIcon />
          </div>
          <div className="leading-tight">
            <p className="font-medium text-sm text-text-primary">{name}</p>
            <p className="font-mono text-text-tertiary text-xs">{status.version ?? t("agent.detected")}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="gap-1 border-green-500/30 bg-green-500/10 text-green-600"
          title={status.path}
        >
          <CheckIcon className="size-3" />
          {t("agent.detected")}
        </Badge>
      </div>
    </div>
  );
}

/**
 * Connect step. The embedded agent runs on an LLM — either a **cloud** provider
 * (OpenRouter key + model, the default) or a **local Ollama** daemon (pick a
 * pulled model tag). A segmented toggle switches between them; the choice +
 * fields are lifted to the wizard so {@link OnboardingWizard.finish} saves them
 * to the embedded config (provider forwarded to the Rust runner).
 */
function ConnectStep({
  t,
  provider,
  setProvider,
  apiKey,
  setApiKey,
  model,
  setModel,
}: {
  t: ReturnType<typeof useTranslations>;
  provider: EmbeddedLlmProvider;
  setProvider: (value: EmbeddedLlmProvider) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <StepHeading icon={<KeyIcon />} title={t("connect.title")} description={t("connect.description")} />

      {/* Cloud ↔ local provider toggle. */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1">
        {(["cloud", "ollama"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setProvider(p)}
            className={
              provider === p
                ? "flex items-center justify-center gap-1.5 rounded-md bg-card-background px-3 py-1.5 font-medium text-sm text-text-primary shadow-sm"
                : "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm text-text-tertiary"
            }
          >
            {p === "cloud" ? <KeyIcon className="size-3.5" /> : <CpuIcon className="size-3.5" />}
            {t(`connect.provider.${p}`)}
          </button>
        ))}
      </div>

      {provider === "cloud" ? (
        <ConnectCloud t={t} apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />
      ) : (
        <ConnectOllama t={t} model={model} setModel={setModel} />
      )}

      {/* key on provider so switching cloud↔ollama clears the previous test result. */}
      <TestConnectionButton key={provider} t={t} provider={provider} apiKey={apiKey} model={model} />
    </div>
  );
}

/**
 * Tests the embedded agent's LLM wiring for real via the `test_embedded_llm` rpc
 * — a tiny OpenRouter completion (cloud) or an Ollama generate (local). Reports
 * success or the backend's error inline.
 */
function TestConnectionButton({
  t,
  provider,
  apiKey,
  model,
}: {
  t: ReturnType<typeof useTranslations>;
  provider: EmbeddedLlmProvider;
  apiKey: string;
  model: string;
}) {
  const [state, setState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  const missingInput = provider === "ollama" ? !model.trim() : !apiKey.trim() && !model.trim();

  const runTest = useCallback(async () => {
    setState("testing");
    setMessage("");
    try {
      await invoke("test_embedded_llm", {
        provider,
        apiKey: provider === "cloud" ? apiKey.trim() || undefined : undefined,
        model: model.trim() || undefined,
      });
      setState("ok");
    } catch (error) {
      setState("error");
      setMessage(
        isDevModeError(error) ? t("connect.test.devOnly") : error instanceof Error ? error.message : String(error),
      );
    }
  }, [provider, apiKey, model, t]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void runTest()}
          disabled={state === "testing" || missingInput}
        >
          {state === "testing" ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
          {state === "testing" ? t("connect.test.testing") : t("connect.test.button")}
        </Button>
        {state === "ok" && (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <CheckIcon className="size-4" />
            {t("connect.test.ok")}
          </span>
        )}
      </div>
      {state === "error" && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs leading-relaxed">
          {message || t("connect.test.failed")}
        </p>
      )}
    </div>
  );
}

/** Cloud (OpenRouter) branch of the connect step. */
function ConnectCloud({
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

/**
 * Local Ollama branch of the connect step. Shows Ollama's install state and, when
 * it's missing, offers a one-click install right here (the `ollama_install` rpc
 * via {@link useOllama}) — then pick a local model tag.
 */
function ConnectOllama({
  t,
  model,
  setModel,
}: {
  t: ReturnType<typeof useTranslations>;
  model: string;
  setModel: (value: string) => void;
}) {
  const ollama = useOllama();
  const { status, loading, busy, install } = ollama;
  const installed = status?.installed === true;
  const models = status?.models ?? [];
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Ollama runtime status + one-click install when missing. */}
      <div className="rounded-lg border border-border-cards bg-card-background p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-secondary text-icon-primary [&_svg]:size-4">
              <CpuIcon />
            </div>
            <div className="leading-tight">
              <p className="font-medium text-sm text-text-primary">{t("connect.ollama.name")}</p>
              <p className="font-mono text-text-tertiary text-xs">
                {loading
                  ? t("connect.ollama.checking")
                  : installed
                    ? (status?.version ?? t("connect.ollama.installed"))
                    : t("connect.ollama.notInstalled")}
              </p>
            </div>
          </div>
          {loading ? (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          ) : installed ? (
            <Badge variant="outline" className="gap-1 border-green-500/30 bg-green-500/10 text-green-600">
              <CheckIcon className="size-3" />
              {t("connect.ollama.ready")}
            </Badge>
          ) : null}
        </div>

        {!loading && !installed && (
          <div className="mt-4 space-y-2.5">
            <p className="text-sm text-text-secondary">{t("connect.ollama.installHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => void install()} disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
                {busy ? t("connect.ollama.installing") : t("connect.ollama.install")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void openExternal(OLLAMA_URL)}>
                {t("connect.ollama.learnMore")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* The model picker only appears once Ollama is installed — and lists the
          real pulled models (same source as Settings), not a free-text guess. */}
      {installed &&
        (models.length > 0 ? (
          <div className="space-y-1.5">
            <label htmlFor="onboarding-ollama-model" className="font-medium text-sm text-text-primary">
              {t("connect.ollama.modelLabel")}
            </label>
            <Select value={model || undefined} onValueChange={setModel}>
              <SelectTrigger id="onboarding-ollama-model">
                <SelectValue placeholder={t("connect.ollama.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.name} value={m.name} className="font-mono text-xs">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="text-primary text-xs underline-offset-2 hover:underline"
            >
              {t("connect.ollama.managePulled")}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 rounded-lg border border-border-cards bg-muted/40 px-3 py-3">
            <p className="text-sm text-text-secondary">{t("connect.ollama.noModels")}</p>
            <Button type="button" size="sm" onClick={() => setManageOpen(true)}>
              <DownloadIcon />
              {t("connect.ollama.downloadModel")}
            </Button>
          </div>
        ))}

      {/* Reuse the Settings model manager (install/pull/remove) for the real list. */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t("connect.ollama.manageTitle")}</DialogTitle>
          <LocalModelManager ollama={ollama} />
        </DialogContent>
      </Dialog>
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
  const selected = homeFolder.trim();

  // Open the OS folder picker (Tauri dialog plugin) so the user never types a path.
  const pickDirectory = useCallback(async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({
      directory: true,
      multiple: false,
      defaultPath: homeFolder.trim() || undefined,
      title: t("folder.title"),
    });
    if (typeof chosen === "string") setHomeFolder(chosen);
  }, [homeFolder, setHomeFolder, t]);

  return (
    <div className="space-y-5">
      <StepHeading icon={<FolderOpenIcon />} title={t("folder.title")} description={t("folder.description")} />
      <div className="space-y-2">
        {isTauri() ? (
          // Native picker is the primary action — click to open the OS window.
          <button
            type="button"
            onClick={() => void pickDirectory()}
            className="flex w-full items-center gap-3 rounded-lg border border-border-cards bg-card-background px-4 py-3 text-left transition-colors hover:bg-muted/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-icon-primary [&_svg]:size-4">
              <FolderOpenIcon />
            </span>
            <span className="min-w-0 flex-1">
              {selected ? (
                <span className="block truncate font-mono text-sm text-text-primary">{selected}</span>
              ) : (
                <span className="block text-sm text-text-secondary">{t("folder.browse")}</span>
              )}
            </span>
            <span className="shrink-0 font-medium text-primary text-xs">
              {selected ? t("folder.change") : t("folder.choose")}
            </span>
          </button>
        ) : (
          // Browser dev (no Tauri): fall back to the editable field.
          <WorkingDirField value={homeFolder} onChange={setHomeFolder} placeholder={t("folder.placeholder")} />
        )}
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
