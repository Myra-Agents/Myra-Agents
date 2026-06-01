"use client";

import { useState } from "react";

import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnections } from "@/hooks/use-connections";
import { hubLogin } from "@/lib/transport/hub";

/**
 * Web upsell shown to free (non-Pro) users instead of the board. Myra Pro is
 * what unlocks reaching your agents from anywhere; free is desktop-only. Doubles
 * as a hub login entry point — an existing Pro user signs into their hub here,
 * which mints a session (⇒ Pro) and reveals the board (no reload needed; the
 * entitlement seam reacts to the new hub).
 */
export function UpsellScreen() {
  const t = useTranslations("upsell");
  const { addHub } = useConnections();
  const [hubUrl, setHubUrl] = useState("");
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    const url = hubUrl.trim();
    const userId = user.trim();
    if (!url || !userId) return;
    if (!/^https?:\/\//.test(url)) {
      toast.error(t("invalidUrl"));
      return;
    }
    setBusy(true);
    try {
      const token = await hubLogin(url, userId);
      addHub({ label: `${userId} @ ${url.replace(/^https?:\/\//, "")}`, baseUrl: url, token });
      toast.success(t("signedIn"));
    } catch {
      toast.error(t("loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[60svh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="size-4 text-primary" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("body")}</p>

          <div className="space-y-3 border-t pt-4">
            <p className="font-medium text-sm">{t("signInTitle")}</p>
            <div className="space-y-1">
              <Label className="text-xs">{t("userField")}</Label>
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="you@example.com"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("urlField")}</Label>
              <Input
                value={hubUrl}
                onChange={(e) => setHubUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="https://hub.example.com"
                className="h-8 font-mono text-xs"
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={busy || !hubUrl.trim() || !user.trim()}
              onClick={handleLogin}
            >
              {t("signIn")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
