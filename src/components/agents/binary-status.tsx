"use client";

import { useCallback, useEffect, useState } from "react";

import { CheckCircle2Icon, CopyIcon, DownloadIcon, ExternalLinkIcon, Loader2Icon, XCircleIcon } from "lucide-react";
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
import type { BinaryStatus } from "@/types/settings";
import { AGENT_INSTALL_INFO } from "@/types/settings";

interface AgentBinaryStatusProps {
  binary: string;
}

/**
 * Shows whether an agent CLI is installed on the connected server (via the
 * `check_binary` rpc) and, when it isn't, offers a one-click install plus
 * manual instructions for the binaries we know (`AGENT_INSTALL_INFO`).
 */
export function AgentBinaryStatus({ binary }: AgentBinaryStatusProps) {
  const t = useTranslations("agents");
  const [status, setStatus] = useState<BinaryStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const name = binary.trim();
  const installInfo = AGENT_INSTALL_INFO[name];

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

  const handleInstall = async () => {
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
  };

  const copyCommand = async (command: string) => {
    await navigator.clipboard.writeText(command);
    toast.success(t("commandCopied"));
  };

  if (!name) return null;

  return (
    <div className="flex items-center gap-2">
      {checking || installing ? (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" />
          {installing ? t("installing") : t("checking")}
        </Badge>
      ) : status?.found ? (
        <Badge
          variant="outline"
          className="gap-1 border-green-500/30 bg-green-500/10 text-green-600"
          title={status.path}
        >
          <CheckCircle2Icon className="size-3" />
          {status.version ? t("installedVersion", { version: status.version }) : t("installed")}
        </Badge>
      ) : status ? (
        <>
          <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
            <XCircleIcon className="size-3" />
            {t("notInstalled")}
          </Badge>
          {installInfo && (
            <Button type="button" variant="outline" size="xs" onClick={handleInstall} disabled={installing}>
              <DownloadIcon className="size-3" />
              {t("install")}
            </Button>
          )}
          {installInfo && (
            <Button type="button" variant="ghost" size="xs" onClick={() => setInstructionsOpen(true)}>
              {t("howToInstall")}
            </Button>
          )}
        </>
      ) : null}

      {installInfo && (
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
      )}
    </div>
  );
}
