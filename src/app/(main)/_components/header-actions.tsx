"use client";

import { type ReactNode, useEffect, useState } from "react";

import { createPortal } from "react-dom";

/** Id of the top-bar slot a page portals its actions into (see the layout header). */
export const HEADER_ACTIONS_ID = "header-actions";

/**
 * Portals page-specific controls into the top bar's right-hand slot (the
 * `#header-actions` container in the `(main)` layout header). Lets a route push
 * its own actions — e.g. the Runs page's List/Kanban view toggle — into the
 * shared top bar without the layout knowing about them.
 *
 * Renders nothing until the slot exists on the client (the layout header mounts
 * first, so by the time a page mounts the target is present).
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById(HEADER_ACTIONS_ID));
  }, []);

  return slot ? createPortal(children, slot) : null;
}
