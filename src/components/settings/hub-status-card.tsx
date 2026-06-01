"use client";

import { CircleIcon, NetworkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHubStatus } from "@/hooks/use-hub-status";
import { cn } from "@/lib/utils";

/**
 * Settings → Hub status. The at-a-glance "is the hub connected and available?"
 * indicator: a colored dot + one line of status, plus a single sign-in/out (or
 * retry) action. Pro-gated — the Settings page only renders it for Pro users.
 */
export function HubStatusCard() {
  const t = useTranslations("settings.hub");
  const { account, isAuthenticated, configured, availability, instanceCount, refresh, signIn, signOut, busy } =
    useHubStatus();

  // Derive dot color + message + action from the combined auth/availability state.
  let dot: string;
  let message: string;
  let action: React.ReactNode = null;

  if (!configured) {
    dot = "text-muted-foreground";
    message = t("notConfigured");
  } else if (!isAuthenticated) {
    dot = "text-muted-foreground";
    message = t("notSignedIn");
    action = (
      <Button size="sm" disabled={busy} onClick={() => void signIn()}>
        {t("signIn")}
      </Button>
    );
  } else if (availability === "checking") {
    dot = "text-amber-500";
    message = t("checking");
  } else if (availability === "online") {
    dot = "text-green-500";
    message = t("connected", { count: instanceCount });
    action = (
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void signOut()}>
        {t("signOut")}
      </Button>
    );
  } else {
    dot = "text-destructive";
    message = t("unreachable");
    action = (
      <Button variant="outline" size="sm" onClick={() => void refresh()}>
        {t("retry")}
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <NetworkIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CircleIcon className={cn("size-2.5 shrink-0 fill-current", dot)} />
            <span className="font-medium text-sm">{t("title")}</span>
          </div>
          <p className="truncate text-muted-foreground text-xs">
            {message}
            {isAuthenticated && account?.email ? ` · ${account.email}` : ""}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
