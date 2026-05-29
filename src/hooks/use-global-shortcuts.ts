"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useShortcutStore } from "@/stores/shortcut-store";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * App-wide (in-app) keyboard shortcuts. Detection lives here once; the actions
 * are executed by KanbanPage via the shortcut store nonces.
 *
 *  - Mod+N  → new card (routes to /kanban first so it works from any page)
 *  - Mod+F  → focus the board card-search input
 *  - Mod+.  → cancel the agent of the card currently open in the modal
 */
export function useGlobalShortcuts(): void {
  const router = useRouter();
  const requestNewCard = useShortcutStore((s) => s.requestNewCard);
  const requestFocusSearch = useShortcutStore((s) => s.requestFocusSearch);
  const requestCancel = useShortcutStore((s) => s.requestCancel);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        router.push("/kanban");
        requestNewCard();
      } else if (key === "f") {
        e.preventDefault();
        requestFocusSearch();
      } else if (key === ".") {
        e.preventDefault();
        requestCancel();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router, requestNewCard, requestFocusSearch, requestCancel]);
}
