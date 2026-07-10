import {
  ActivityIcon,
  CreditCardIcon,
  FileTextIcon,
  GitBranchIcon,
  type LucideIcon,
  MailIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  PuzzleIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";

import { connectionManager } from "@/lib/connections/manager";
import { isDevModeError } from "@/lib/tauri";
import type { PluginInfo } from "@/types/settings";

/** A trigger-capable connector, as shown in the Add-Trigger picker. */
export interface ConnectorTrigger {
  id: string;
  name: string;
  icon: LucideIcon;
  summary?: string;
}

/** Optional display metadata a connector's manifest may declare (surfaced opaquely
 *  by list_plugins once the server passes `catalog` through; safe if absent). */
interface CatalogMeta {
  name?: string;
  icon?: string;
  verbs?: string[];
  trigger?: { summary?: string };
}
type PluginInfoWithCatalog = PluginInfo & { catalog?: CatalogMeta };

const ICONS: Record<string, LucideIcon> = {
  mail: MailIcon,
  slack: MessageSquareIcon,
  github: GitBranchIcon,
  discord: MessageCircleIcon,
  notion: FileTextIcon,
  stripe: CreditCardIcon,
  teams: UsersIcon,
  sentry: TriangleAlertIcon,
  linear: ActivityIcon,
};

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Dev/browser fallback so the picker is demoable without a running sidecar.
const SEED: ConnectorTrigger[] = [
  { id: "gmail", name: "Gmail", icon: MailIcon, summary: "New email matching your rules" },
];

/**
 * Installed plugins that can trigger an agent — those with the `event` role (a
 * long-lived reaction/poller), or whose `catalog.verbs` include "trigger". Maps
 * each to a picker entry (name + icon + summary), preferring the manifest's
 * `catalog` metadata and falling back to the folder id.
 */
export async function listConnectorTriggers(): Promise<ConnectorTrigger[]> {
  try {
    const id = connectionManager.primaryId();
    const plugins = await connectionManager.invokeOne<PluginInfoWithCatalog[]>(id, "list_plugins");
    return plugins
      .filter((p) => p.roles.includes("event") || p.catalog?.verbs?.includes("trigger"))
      .map((p) => ({
        id: p.name,
        name: p.catalog?.name ?? titleCase(p.name),
        icon: ICONS[p.catalog?.icon ?? p.name] ?? PuzzleIcon,
        summary: p.catalog?.trigger?.summary,
      }));
  } catch (e) {
    if (isDevModeError(e)) return SEED;
    return [];
  }
}
