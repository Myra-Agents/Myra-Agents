"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { siGithub } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app-config";

const DISMISS_KEY = "myra.sidebar-support-dismissed";

/**
 * Optional sidebar footer card pointing users to the repo. Dismissible — the
 * choice persists in localStorage so it stays hidden across launches. Hidden
 * when the sidebar is collapsed to icons.
 */
export function SidebarSupportCard() {
  const t = useTranslations("nav.support");
  const [dismissed, setDismissed] = useState(true);

  // Read the persisted choice after mount to avoid an SSR/hydration flash.
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <Card size="sm" className="relative shadow-none group-data-[collapsible=icon]:hidden">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="absolute top-2 right-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{t("title")}</CardTitle>
        <CardDescription>
          {t("body")}&nbsp;
          <Link
            href={APP_CONFIG.repoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("repo")}
            className="inline-flex items-center text-foreground"
          >
            <SimpleIcon icon={siGithub} aria-hidden className="size-3 fill-current" />
          </Link>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
