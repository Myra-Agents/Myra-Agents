import { connectionManager } from "@/lib/connections/manager";
import { isDevModeError } from "@/lib/tauri";

/** User-facing role verbs, mapped from a plugin's manifest roles. */
export type CatalogVerb = "trigger" | "action" | "notify" | "receive";

/**
 * One installable plugin as shown in the Browse catalog. Mirrors the
 * `registry.json` the plugins repo will publish (Slice 1) and the shape the
 * `list_catalog` rpc will return (Slice 2). Until that backend ships, the seed
 * below feeds the UI and `installed` is derived from the user's real
 * `list_plugins`.
 */
export interface CatalogEntry {
  id: string;
  group: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string;
  verbs: CatalogVerb[];
  installed: boolean;
  updateAvailable?: boolean;
  setup?: { type: "oauth" | "cli"; label: string };
}

/**
 * Curated first-party catalog. Static until the `list_catalog` rpc lands; kept in
 * sync with the plugins repo by hand for now. NOTE: this is a placeholder — real
 * install state and the live list come from the server once Slice 2 ships.
 */
const SEED: Omit<CatalogEntry, "installed">[] = [
  {
    id: "gmail",
    group: "integrations",
    name: "Gmail",
    description: "Trigger an agent when mail arrives. Send replies. Search your inbox.",
    version: "0.1.0",
    author: "Myra",
    icon: "mail",
    verbs: ["trigger", "action"],
    setup: { type: "oauth", label: "Connect Gmail" },
  },
  {
    id: "slack",
    group: "notifications",
    name: "Slack",
    description: "Post agent results to a Slack channel via webhook.",
    version: "0.1.0",
    author: "Myra",
    icon: "slack",
    verbs: ["notify"],
  },
  {
    id: "github",
    group: "integrations",
    name: "GitHub",
    description: "Turn a webhook (PR opened, issue…) into a board card.",
    version: "0.1.0",
    author: "Myra",
    icon: "github",
    verbs: ["receive"],
  },
  {
    id: "discord",
    group: "notifications",
    name: "Discord",
    description: "Ping a Discord channel on card state changes.",
    version: "0.1.0",
    author: "Myra",
    icon: "discord",
    verbs: ["notify"],
  },
  {
    id: "notion",
    group: "integrations",
    name: "Notion",
    description: "Create a card from a new Notion database row.",
    version: "0.1.0",
    author: "Myra",
    icon: "notion",
    verbs: ["trigger"],
  },
  {
    id: "stripe",
    group: "integrations",
    name: "Stripe",
    description: "Kick off an agent on a new charge or a failed payment.",
    version: "0.1.0",
    author: "Myra",
    icon: "stripe",
    verbs: ["trigger", "action"],
  },
];

/**
 * The catalog to render in Browse. Tries the live `list_catalog` rpc; falls back
 * to the seed (marking `installed` from the caller's real installed-plugin names)
 * until that command exists on the server.
 */
export async function listCatalog(installedNames: string[]): Promise<CatalogEntry[]> {
  const installed = new Set(installedNames);
  try {
    const id = connectionManager.primaryId();
    const live = await connectionManager.invokeOne<CatalogEntry[]>(id, "list_catalog");
    if (Array.isArray(live) && live.length > 0) return live;
  } catch {
    // rpc not shipped yet (or dev browser) — fall through to the seed.
  }
  return SEED.map((entry) => ({ ...entry, installed: installed.has(entry.id) }));
}

/**
 * Install a plugin by id via the server. No-ops silently in dev/when the rpc
 * isn't shipped yet, so the Browse UI stays demoable ahead of Slice 2.
 */
export async function installPlugin(id: string): Promise<void> {
  try {
    const cid = connectionManager.primaryId();
    await connectionManager.invokeOne(cid, "install_plugin", { input: { id } });
  } catch (e) {
    if (!isDevModeError(e)) {
      // Backend not ready yet — swallow so the optimistic UI can proceed.
      console.warn("install_plugin unavailable:", e);
    }
  }
}
