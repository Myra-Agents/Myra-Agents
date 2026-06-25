"use client";

import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

/** Flat `url → title` lookup built from the sidebar nav (top-level + sub-items). */
const TITLE_BY_PATH: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of sidebarItems) {
    for (const item of group.items) {
      map[item.url] = item.title;
      for (const sub of item.subItems ?? []) map[sub.url] = sub.title;
    }
  }
  return map;
})();

function titleFor(path: string): string {
  if (TITLE_BY_PATH[path]) return TITLE_BY_PATH[path];
  if (path === "/" || path === "") return "Home";
  const seg = path.split("/").filter(Boolean).pop() ?? "";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

/**
 * Centered top-bar breadcrumb reflecting the current route. Top-level pages show
 * a single leaf (e.g. "Runs"); nested routes render parent → leaf with a
 * chevron separator, matching the Figma top bar.
 */
export function HeaderBreadcrumb() {
  const raw = usePathname();
  // Static export uses trailingSlash:true → strip it so lookups match.
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;

  const segments = path.split("/").filter(Boolean);
  // Build cumulative crumbs: /a/b → [{/a}, {/a/b}].
  const crumbs = segments.map((_, i) => {
    const url = `/${segments.slice(0, i + 1).join("/")}`;
    return { url, label: titleFor(url) };
  });
  if (crumbs.length === 0) crumbs.push({ url: "/", label: titleFor("/") });

  return (
    <Breadcrumb className="pointer-events-auto">
      <BreadcrumbList className="gap-1.5 text-sm sm:gap-1.5">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <BreadcrumbItem key={crumb.url}>
              {isLast ? (
                <BreadcrumbPage className="text-text-primary">{crumb.label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink href={crumb.url} className="text-text-tertiary hover:text-text-secondary">
                    {crumb.label}
                  </BreadcrumbLink>
                  <BreadcrumbSeparator className="text-icon-tertiary" />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
