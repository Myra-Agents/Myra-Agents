import { Bot, Calendar, House, Kanban, type LucideIcon, ScrollText } from "lucide-react";

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
      {
        title: "Home",
        url: "/",
        icon: House,
        description: "Your overview — recent activity and what needs attention across boards.",
      },
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
    label: "Workspace",
    items: [
      {
        title: "Kanban",
        url: "/kanban",
        icon: Kanban,
        description: "Track your agents' tasks across columns — drag cards to move work along.",
      },
      {
        title: "Agents",
        url: "/agents",
        icon: Bot,
        description: "See which agents are running right now — live status, elapsed time, and usage.",
      },
      {
        title: "Schedules",
        url: "/schedules",
        icon: Calendar,
        description: "Set up recurring and cron-triggered runs so agents fire on their own.",
      },
      // Day Planner is parked for now — re-enable with the ClipboardList icon import.
      // {
      //   title: "Day Planner",
      //   url: "/planner",
      //   icon: ClipboardList,
      // },
      {
        title: "Logs",
        url: "/logs",
        icon: ScrollText,
        description: "Inspect run history and detailed execution output for every agent.",
      },
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
