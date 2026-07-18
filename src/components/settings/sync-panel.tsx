"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, MonitorIcon, RefreshCwIcon, ShieldIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useConfirm } from "@/hooks/use-confirm";
import { useSync } from "@/hooks/use-sync";

/**
 * Settings → Sync. Drives the E2E-encrypted sync session: set up (with a
 * show-once recovery code), unlock, join from a recovery code, the device list +
 * revoke (which rotates the vault key), and a manual "sync now". The hub only
 * ever holds ciphertext + public keys; copy here makes the secret-loss and
 * re-prompt trade-offs explicit.
 */
export function SyncPanel() {
  const t = useTranslations("settings.sync");
  const { isAuthenticated: authed } = useAuth();
  const { status, busy, error, available, setUp, unlock, join, revoke, leave, syncNow } = useSync();
  const { confirm, confirmDialog } = useConfirm();

  const [label, setLabel] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [revealCode, setRevealCode] = useState<string | null>(null);

  const showRecovery = (res?: { recoveryCode: string }) => {
    if (res?.recoveryCode) setRevealCode(res.recoveryCode);
  };

  if (!available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t("unavailable")}</p>
        </CardContent>
      </Card>
    );
  }

  if (!authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t("signInRequired")}</p>
        </CardContent>
      </Card>
    );
  }

  const enrolled = status?.enrolled ?? false;
  const unlocked = status?.unlocked ?? false;
  const devices = status?.devices ?? [];

  return (
    <Card>
      {confirmDialog}
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldIcon className="size-4 text-muted-foreground" />
            {t("title")}
          </CardTitle>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        {enrolled && unlocked && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void syncNow()}>
            {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <RefreshCwIcon className="size-3.5" />}
            {t("syncNow")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        {revealCode && <RecoveryReveal code={revealCode} onDismiss={() => setRevealCode(null)} />}

        {/* Not enrolled on this device → set up fresh, or join with a recovery code. */}
        {!enrolled && !revealCode && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs">{t("deviceLabel")}</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("deviceLabelPlaceholder")}
              />
              <Button
                size="sm"
                disabled={busy || label.trim().length === 0}
                onClick={async () => showRecovery(await setUp(label.trim()))}
              >
                {busy && <Loader2Icon className="size-3.5 animate-spin" />}
                {t("setUp")}
              </Button>
              <p className="text-muted-foreground text-xs">{t("setUpHint")}</p>
            </div>

            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <Label className="text-xs">{t("joinTitle")}</Label>
              <Input
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value)}
                placeholder={t("recoveryPlaceholder")}
                className="font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || recoveryInput.trim().length === 0}
                onClick={() => void join(recoveryInput.trim(), label.trim() || t("thisDevice"))}
              >
                {t("join")}
              </Button>
              <p className="text-muted-foreground text-xs">{t("joinHint")}</p>
            </div>
          </div>
        )}

        {/* Enrolled but locked → unlock with this device's key. */}
        {enrolled && !unlocked && (
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <p className="text-muted-foreground text-sm">{t("lockedHint")}</p>
            <Button size="sm" disabled={busy} onClick={() => void unlock()}>
              {busy && <Loader2Icon className="size-3.5 animate-spin" />}
              {t("unlock")}
            </Button>
          </div>
        )}

        {/* Enrolled + unlocked → device list + revoke. */}
        {enrolled && unlocked && (
          <div className="space-y-3">
            <Alert>
              <KeyRoundIcon className="size-4" />
              <AlertTitle>{t("e2eTitle")}</AlertTitle>
              <AlertDescription>{t("e2eBody")}</AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("devices")}</Label>
              {devices.map((d) => {
                const isThis = d.deviceId === status?.deviceId;
                return (
                  <div key={d.deviceId} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <MonitorIcon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{d.label}</span>
                    {isThis && <Badge variant="secondary">{t("thisDevice")}</Badge>}
                    {!isThis && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={async () => {
                          if (!(await confirm({ description: t("revokeConfirm", { label: d.label }) }))) return;
                          showRecovery(await revoke(d.deviceId));
                          toast.success(t("revoked", { label: d.label }));
                        }}
                      >
                        {t("revoke")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => void leave()}
              >
                {t("leave")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Show-once recovery code with a copy button and an explicit acknowledge gate. */
function RecoveryReveal({ code, onDismiss }: { code: string; onDismiss: () => void }) {
  const t = useTranslations("settings.sync");
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2 font-medium text-sm">
        <KeyRoundIcon className="size-4 text-amber-600" />
        {t("recoveryTitle")}
      </div>
      <p className="text-muted-foreground text-xs">{t("recoveryWarning")}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded bg-background px-3 py-2 font-mono text-sm tracking-wider">
          {code}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        {t("recoveryAck")}
      </label>
      <Button size="sm" disabled={!ack} onClick={onDismiss}>
        {t("recoveryDone")}
      </Button>
    </div>
  );
}
