"use client";

import { LogInIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

/**
 * Web upsell shown to free (non-Pro) users instead of the board. Myra Pro is
 * what unlocks reaching your agents from anywhere; free is desktop-only. Doubles
 * as the sign-in entry point — an existing Pro user signs in with Clerk, which
 * mints a hub session (⇒ Pro) and reveals the board (no reload; entitlement
 * reacts to the session). AuthBootstrap completes the exchange on redirect back.
 */
export function UpsellScreen() {
  const t = useTranslations("upsell");
  const { signIn, busy } = useAuth();

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
            <Button size="sm" className="w-full" disabled={busy} onClick={() => void signIn()}>
              <LogInIcon className="size-3.5" />
              {t("signIn")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
