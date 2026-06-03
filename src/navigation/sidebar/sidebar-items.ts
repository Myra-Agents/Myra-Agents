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
      },
      {
        title: "Schedules",
        url: "/schedules",
        icon: Calendar,
      },
      {
        title: "Day Planner",
        url: "/planner",
        icon: ClipboardList,
      },
      {
        title: "Logs",
        url: "/logs",
        icon: ScrollText,
      },
    ],
  },
];
