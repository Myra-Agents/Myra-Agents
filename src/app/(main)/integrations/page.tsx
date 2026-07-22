"use client";

import { PlugIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { IntegrationsPanel } from "@/components/settings/integrations/integrations-panel";

/**
 * Top-level Integrations page — connect and configure connector plugins
 * (Gmail, GitLab, Slack, …) independent of Settings. A connected instance's
 * event triggers and post-run actions are then picked up from a patrol's own
 * editor (Add-Trigger / Actions), not configured here.
 */
export default function IntegrationsPage() {
  const t = useTranslations("settings.integrations");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <PlugIcon className="size-5 text-muted-foreground" />
        <h1 className="font-semibold text-xl tracking-tight">{t("title")}</h1>
      </div>
      <IntegrationsPanel />
    </div>
  );
}
