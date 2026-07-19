"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Payload of `deep-link-navigate`, emitted by the Rust `myra://` handler. */
interface DeepLinkNavigate {
  path: string;
}

/**
 * Consumes `myra://patrol/new?template=<id>` deep links from the landing site's
 * "Open in Myra" buttons. The Rust handler maps the link to an in-app route
 * (`/schedules/edit/?template=<id>`, the patrol editor prefilled from the
 * template) and both:
 *   - buffers it — for a **cold start**, where the link launched the app and
 *     fired before this listener mounted; we drain the buffer once here, and
 *   - emits `deep-link-navigate` — for a **warm start**, where the app was
 *     already running; we route on the live event.
 *
 * The live handler also drains the buffer so a later remount (hard navigation in
 * the static export) can't replay the same navigation.
 */
export function DeepLinkListener() {
  const router = useRouter();

  useEffect(() => {
    // Deep links only exist in the desktop shell; in a plain browser the Tauri
    // event/invoke APIs have no backend.
    if (!isTauri()) return;

    void invoke<string | null>("take_pending_deep_link")
      .then((path) => path && router.push(path))
      .catch(() => undefined);

    let unlisten: (() => void) | undefined;
    void listen<DeepLinkNavigate>("deep-link-navigate", ({ payload }) => {
      void invoke("take_pending_deep_link").catch(() => undefined);
      router.push(payload.path);
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, [router]);

  return null;
}
