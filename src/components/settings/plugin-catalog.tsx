"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CheckIcon,
  CreditCardIcon,
  DownloadIcon,
  FileTextIcon,
  GitBranchIcon,
  HashIcon,
  type LucideIcon,
  MailIcon,
  MessageCircleIcon,
  PuzzleIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CatalogEntry, type CatalogVerb, installPlugin, listCatalog } from "@/lib/catalog";

/** Manifest icon name → lucide component. Unknown names fall back to a puzzle. */
const ICONS: Record<string, LucideIcon> = {
  mail: MailIcon,
  slack: HashIcon,
  github: GitBranchIcon,
  discord: MessageCircleIcon,
  notion: FileTextIcon,
  stripe: CreditCardIcon,
};

/** Role dot color, from the Myra task-status tokens (theme-aware). */
const VERB_COLOR: Record<CatalogVerb, string> = {
  trigger: "var(--task-status-running)",
  action: "var(--task-status-needs-you)",
  receive: "var(--task-status-done)",
  notify: "var(--muted-foreground)",
};

type Filter = "all" | "trigger" | "action" | "notify";
const FILTERS: Filter[] = ["all", "trigger", "action", "notify"];

/**
 * Settings → Plugins → Browse. A responsive card grid of installable first-party
 * plugins with search + category filters. Install state comes from the user's
 * real installed plugins (passed in); the catalog itself is served by
 * `listCatalog` (seed today, `list_catalog` rpc once Slice 2 ships).
 */
export function PluginCatalog({ installedNames, onInstalled }: { installedNames: string[]; onInstalled: () => void }) {
  const t = useTranslations("settings.plugins");
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setEntries(await listCatalog(installedNames));
  }, [installedNames]);

  useEffect(() => {
    void load();
  }, [load]);

  const install = useCallback(
    async (id: string) => {
      setInstalling((s) => new Set(s).add(id));
      await installPlugin(id);
      setEntries((list) => list?.map((e) => (e.id === id ? { ...e, installed: true } : e)) ?? null);
      setInstalling((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      onInstalled();
    },
    [onInstalled],
  );

  const shown = (entries ?? []).filter((e) => {
    if (filter !== "all" && !e.verbs.includes(filter)) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${e.name} ${e.description}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("browse.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)}>
              {t(`browse.filter.${f}`)}
            </Button>
          ))}
        </div>
      </div>

      {entries !== null && shown.length === 0 && (
        <p className="py-8 text-center text-muted-foreground text-sm">{t("browse.empty")}</p>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        {shown.map((e) => {
          const Icon = ICONS[e.icon] ?? PuzzleIcon;
          const busy = installing.has(e.id);
          return (
            <div key={e.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 flex-none items-center justify-center rounded-md bg-muted">
                  <Icon className="size-5 text-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm leading-tight">{e.name}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {t("browse.by", { author: e.author, version: e.version })}
                  </p>
                </div>
              </div>

              <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">{e.description}</p>

              <div className="flex flex-wrap gap-1.5">
                {e.verbs.map((v) => (
                  <Badge key={v} variant="secondary" className="gap-1.5 font-normal">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: VERB_COLOR[v] }} />
                    {t(`browse.verb.${v}`)}
                  </Badge>
                ))}
              </div>

              {e.installed ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto w-full"
                  style={{ color: "var(--task-status-done)" }}
                >
                  <CheckIcon className="size-4" />
                  {t("browse.installed")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto w-full"
                  disabled={busy}
                  onClick={() => install(e.id)}
                >
                  <DownloadIcon className="size-4" />
                  {busy ? t("browse.installing") : t("browse.install")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
