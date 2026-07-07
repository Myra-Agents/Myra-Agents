"use client";

import { Fragment } from "react";

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
import { useBreadcrumbStore } from "@/stores/breadcrumb-store";

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

  const override = useBreadcrumbStore((s) => s.override);

  const segments = path.split("/").filter(Boolean);
  // Build cumulative crumbs: /a/b → [{/a}, {/a/b}]. A crumb without a url
  // renders as plain text (non-clickable) — used for section labels that have
  // no route of their own (e.g. "Template").
  const crumbs: { url?: string; label: string }[] = segments.map((_, i) => {
    const url = `/${segments.slice(0, i + 1).join("/")}`;
    return { url, label: titleFor(url) };
  });
  if (crumbs.length === 0) crumbs.push({ url: "/", label: titleFor("/") });

  // A route may override the trailing crumb with a dynamic label/href the path
  // can't express (e.g. a schedule's name on the editor route).
  if (override && crumbs.length > 0) {
    // An explicit parent rebuilds the whole trail (parent › leaf) so a detail
    // view can claim a different section than its path implies — e.g. the run
    // detail at `/logs` showing "Operations › {title}".
    if (override.parent) {
      crumbs.length = 0;
      crumbs.push({ url: override.parent.href, label: override.parent.label });
      crumbs.push({ url: override.href ?? path, label: override.label });
    } else {
      const leaf = crumbs[crumbs.length - 1];
      leaf.label = override.label;
      if (override.href) leaf.url = override.href;
    }
    // An optional section crumb slots in right before the leaf — e.g. the
    // template editor shows "Patrols › Template › {name}".
    if (override.section) {
      crumbs.splice(crumbs.length - 1, 0, { url: override.section.href, label: override.section.label });
    }
  }

  return (
    <Breadcrumb className="pointer-events-auto">
      <BreadcrumbList className="gap-1.5 text-sm sm:gap-1.5">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          // The separator is itself an <li>, so it must be a *sibling* of the
          // BreadcrumbItem <li> (inside the <ol>), never nested within it — a
          // nested <li> is invalid HTML and triggers a hydration error.
          return (
            // Key by position, not url: during a route transition the override
            // can briefly produce two crumbs sharing a url (e.g. parent + leaf
            // both "/runs"), which would collide on a url-based key.
            <Fragment key={`${i}-${crumb.url}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="text-text-primary">{crumb.label}</BreadcrumbPage>
                ) : crumb.url ? (
                  <BreadcrumbLink href={crumb.url} className="text-text-tertiary hover:text-text-secondary">
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <span className="text-text-tertiary">{crumb.label}</span>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator className="text-icon-tertiary" />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
