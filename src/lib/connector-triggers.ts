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

/** A post-run action a connector can perform (from its manifest catalog.actions). */
export interface ConnectorActionType {
  id: string;
  label: string;
  summary?: string;
}

/** A connector that can run actions at the end of a patrol. */
export interface ConnectorActionProvider {
  id: string;
  name: string;
  icon: LucideIcon;
  actions: ConnectorActionType[];
}

/** Optional display metadata a connector's manifest may declare (surfaced opaquely
 *  by list_plugins once the server passes `catalog` through; safe if absent). */
interface CatalogMeta {
  name?: string;
  icon?: string;
  verbs?: string[];
  trigger?: { summary?: string };
  actions?: ConnectorActionType[];
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

const ACTION_SEED: ConnectorActionProvider[] = [
  {
    id: "gmail",
    name: "Gmail",
    icon: MailIcon,
    actions: [
      { id: "send", label: "Send an email", summary: "Email the run result" },
      { id: "draft", label: "Create a draft", summary: "Save the result as a Gmail draft" },
    ],
  },
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

/**
 * Installed connectors that can run a post-run action — those declaring
 * `catalog.actions` (or `catalog.verbs` including "action"/"notify"). Each entry
 * carries its action types (send, draft, …) for the Actions picker's submenu.
 * Needs the server to pass `catalog` through list_plugins for real data; falls
 * back to a dev seed otherwise.
 */
export async function listConnectorActions(): Promise<ConnectorActionProvider[]> {
  try {
    const id = connectionManager.primaryId();
    const plugins = await connectionManager.invokeOne<PluginInfoWithCatalog[]>(id, "list_plugins");
    return plugins
      .map((p) => ({
        id: p.name,
        name: p.catalog?.name ?? titleCase(p.name),
        icon: ICONS[p.catalog?.icon ?? p.name] ?? PuzzleIcon,
        actions: p.catalog?.actions ?? [],
      }))
      .filter((c) => c.actions.length > 0);
  } catch (e) {
    if (isDevModeError(e)) return ACTION_SEED;
    return [];
  }
}
