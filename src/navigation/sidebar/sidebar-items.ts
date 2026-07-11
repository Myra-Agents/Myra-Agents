// House, ScrollText icons parked — Home/Logs nav entries commented out below.
import { Activity, History, type LucideIcon, Route } from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  /** Longer hover hint shown in the sidebar tooltip. */
  description?: string;
  /**
   * Extra path prefixes that should also light this item — for detail routes
   * that live outside the item's own `url`.
   */
  matchPaths?: string[];
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

// Sidebar organized Linear-style: a label-less personal section on top,
// then collapsible labeled scopes below (workspace-wide first, then per-team).
export const sidebarItems: NavGroup[] = [
  {
    // Personal section — no label, always visible (Linear's Inbox / My issues row).
    id: 1,
    items: [
      // {
      //   title: "Home",
      //   url: "/",
      //   icon: House,
      //   description: "Your overview — recent activity and what needs attention across boards.",
      // },
      // {
      //   title: "Inbox",
      //   url: "/inbox",
      //   icon: Inbox, // lucide: Inbox — agent results awaiting attention, with unread count badge
      // },
      // {
      //   title: "My cards",
      //   url: "/my-cards",
      //   icon: SquareUser, // lucide: SquareUser — cards assigned to me across boards
      // },
    ],
  },
  {
    // Workspace scope — everything org/app-wide.
    id: 2,
    items: [
      {
        // Temporary "Runs" view from the new UI refactor (Figma) — live overview
        // of running tasks with status summary cards. Remove/merge once the
        // redesign lands fully.
        title: "Operations",
        url: "/runs",
        icon: Activity,
        description: "Live overview of running tasks — counts by status and the active run list.",
        isNew: true,
      },
      {
        title: "Patrols",
        url: "/schedules",
        icon: Route,
        description: "Set up recurring and cron-triggered runs so agents fire on their own.",
      },
      // Day Planner is parked for now — re-enable with the ClipboardList icon import.
      // {
      //   title: "Day Planner",
      //   url: "/planner",
      //   icon: ClipboardList,
      // },
      {
        // "History" view from the new UI refactor (Figma `history` + `agent-session`)
        // — past runs of every schedule (succeeded or failed) with stats, plus a
        // per-run agent-session detail at `/history/run`.
        title: "History",
        url: "/history",
        icon: History,
        description: "Past runs of every patrol — stats and per-run agent discussion, succeeded or failed.",
        isNew: true,
      },
      // {
      //   title: "Logs",
      //   url: "/logs",
      //   icon: ScrollText,
      //   description: "Inspect run history and detailed execution output for every agent.",
      // },
      // {
      //   title: "Views",
      //   url: "/views",
      //   icon: Layers2, // lucide: Layers2 — saved filtered views of cards (Linear's "Views")
      // },
    ],
  },
  // {
  //   // Per-board scope — one entry per connected board, each with its own subtree
  //   // (Linear's "Your teams" pattern: team name collapses to Issues / Projects / Views).
  //   id: 3,
  //   label: "Your boards",
  //   items: [
  //     {
  //       title: "Local",
  //       url: "/boards/local",
  //       icon: HardDrive, // lucide: HardDrive — the sidecar-served local board
  //       subItems: [
  //         { title: "Cards", url: "/boards/local/cards", icon: Kanban },
  //         { title: "Schedules", url: "/boards/local/schedules", icon: Calendar },
  //         { title: "Logs", url: "/boards/local/logs", icon: ScrollText },
  //       ],
  //     },
  //   ],
  // },
  // {
  //   // Onboarding section — shown to new users, dismissed once configured
  //   // (Linear's "Try" pattern: Import issues / Invite people / Connect Cursor).
  //   id: 4,
  //   label: "Get started",
  //   items: [
  //     { title: "Connect an agent", url: "/settings/agents", icon: Bot },       // lucide: Bot
  //     { title: "Import cards", url: "/settings/import", icon: FileInput },     // lucide: FileInput
  //     { title: "Connect a board", url: "/settings/connections", icon: Plug },  // lucide: Plug
  //   ],
  // },
];
