import { Calendar, ClipboardList, Kanban, type LucideIcon, ScrollText } from "lucide-react";

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

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Workspace",
    items: [
      {
        title: "Kanban",
        url: "/kanban",
        icon: Kanban,
        description: "Track your agents' tasks across columns — drag cards to move work along.",
      },
      {
        title: "Schedules",
        url: "/schedules",
        icon: Calendar,
        description: "Set up recurring and cron-triggered runs so agents fire on their own.",
      },
      {
        title: "Day Planner",
        url: "/planner",
        icon: ClipboardList,
        description: "Lay out today's agenda and see what each agent is slated to do.",
      },
      {
        title: "Logs",
        url: "/logs",
        icon: ScrollText,
        description: "Inspect run history and detailed execution output for every agent.",
      },
    ],
  },
];
