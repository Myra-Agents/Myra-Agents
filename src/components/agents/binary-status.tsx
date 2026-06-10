"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  TerminalIcon,
  XCircleIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { invoke, openExternal } from "@/lib/tauri";
import type { AgentInstallInfo, BinaryStatus } from "@/types/settings";
import { AGENT_INSTALL_INFO } from "@/types/settings";

/**
 * Shared install/status logic for an agent CLI. Owns the `check_binary` rpc, the
 * one-click `install_agent` rpc, and the manual-instructions dialog state. A
 * single instance feeds both the status badge and the install gate so we don't
 * fire two `check_binary` calls per preset.
 */
export function useBinaryStatus(binary: string) {
  const t = useTranslations("agents");
  const [status, setStatus] = useState<BinaryStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const name = binary.trim();
  const installInfo: AgentInstallInfo | undefined = AGENT_INSTALL_INFO[name];

  const check = useCallback(async () => {
    if (!name) {
      setStatus(null);
      return;
    }
    setChecking(true);
    try {
      setStatus(await invoke<BinaryStatus>("check_binary", { binary: name }));
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, [name]);

  useEffect(() => {
    const timer = setTimeout(() => void check(), 400);
    return () => clearTimeout(timer);
  }, [check]);

  const install = useCallback(async () => {
    setInstalling(true);
    try {
      await invoke("install_agent", { binary: name });
      toast.success(t("installSucceeded", { binary: name }));
      await check();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("installFailed", { binary: name }));
      setInstructionsOpen(true);
    } finally {
      setInstalling(false);
    }
  }, [name, t, check]);

  return {
    name,
    status,
    checking,
    installing,
    installInfo,
    instructionsOpen,
    setInstructionsOpen,
    check,
    install,
    /** True once a check resolved and the binary is known-missing. */
    missing: status != null && !status.found,
  };
}

type BinaryStatusState = ReturnType<typeof useBinaryStatus>;

/** Compact status pill — shown in the preset header next to its name. */
function AgentStatusBadge({ status, checking, installing }: BinaryStatusState) {
  const t = useTranslations("agents");
  if (checking || installing) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        {installing ? t("installing") : t("checking")}
      </Badge>
    );
  }
  if (status?.found) {
    return (
      <Badge variant="outline" className="gap-1 border-green-500/30 bg-green-500/10 text-green-600" title={status.path}>
        <CheckCircle2Icon className="size-3" />
        {status.version ? t("installedVersion", { version: status.version }) : t("installed")}
      </Badge>
    );
  }
  if (status) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
        <XCircleIcon className="size-3" />
        {t("notInstalled")}
      </Badge>
    );
  }
  return null;
}

/** The manual-install dialog (command list + docs + recheck). */
function InstructionsDialog({ name, installInfo, instructionsOpen, setInstructionsOpen, check }: BinaryStatusState) {
  const t = useTranslations("agents");
  if (!installInfo) return null;
  const copyCommand = async (command: string) => {
    await navigator.clipboard.writeText(command);
    toast.success(t("commandCopied"));
  };
  return (
    <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("installTitle", { binary: name })}</DialogTitle>
          <DialogDescription>{t("installDescription", { binary: name })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {installInfo.methods.map((method) => (
            <div key={method.id} className="space-y-1">
              <p className="font-medium text-xs">{method.label}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1.5 font-mono text-xs">
                  {method.command}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  title={t("copyCommand")}
                  onClick={() => copyCommand(method.command)}
                >
                  <CopyIcon className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => openExternal(installInfo.docsUrl)}>
            <ExternalLinkIcon className="size-3.5" />
            {t("openDocs")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void check()}>
            {t("recheck")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shows whether an agent CLI is installed (badge) and, when it isn't, offers a
 * one-click install plus manual instructions. Self-contained — kept for places
 * that only want the inline indicator.
 */
export function AgentBinaryStatus({ binary }: { binary: string }) {
  const t = useTranslations("agents");
  const state = useBinaryStatus(binary);
  if (!state.name) return null;
  return (
    <div className="flex items-center gap-2">
      <AgentStatusBadge {...state} />
      {state.missing && state.installInfo && (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void state.install()}
            disabled={state.installing}
          >
            <DownloadIcon className="size-3" />
            {t("install")}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => state.setInstructionsOpen(true)}>
            {t("howToInstall")}
          </Button>
        </>
      )}
      <InstructionsDialog {...state} />
    </div>
  );
}

interface AgentInstallGateProps {
  state: BinaryStatusState;
  /** Lets the user reveal the config fields even while the binary is missing. */
  onConfigureAnyway?: () => void;
}

/**
 * Full-width gate rendered in place of an agent preset's config fields while its
 * binary is missing: automatic install, manual instructions, and an escape hatch
 * to configure anyway (needed for custom binaries we can't auto-install).
 */
export function AgentInstallGate({ state, onConfigureAnyway }: AgentInstallGateProps) {
  const t = useTranslations("agents");
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <TerminalIcon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-sm">{t("installGateTitle", { binary: state.name })}</p>
        <p className="max-w-sm text-muted-foreground text-xs">{t("installGateDescription")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" onClick={() => void state.install()} disabled={state.installing}>
          {state.installing ? <Loader2Icon className="size-3.5 animate-spin" /> : <DownloadIcon className="size-3.5" />}
          {t("installAuto")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => state.setInstructionsOpen(true)}>
          <TerminalIcon className="size-3.5" />
          {t("installManually")}
        </Button>
      </div>
      {onConfigureAnyway && (
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={onConfigureAnyway}>
          {t("configureAnyway")}
        </Button>
      )}
      <InstructionsDialog {...state} />
    </div>
  );
}

export { AgentStatusBadge };
