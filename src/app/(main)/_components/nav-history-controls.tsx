"use client";

import { useCallback, useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// sessionStorage keys. The pointer must persist across full page reloads:
// the Tauri build is a static export (`output: "export"`), so route changes
// fall back to *hard* browser navigations (RSC payload can't be fetched) that
// reset all React state. Tracking the pointer in React alone would reset to 0
// on every navigation — sessionStorage survives reloads, dies with the window.
const K = {
  idx: "myra:nav:idx", // current position in the in-app history
  max: "myra:nav:max", // furthest position reached (forward boundary)
  intent: "myra:nav:intent", // pending back/forward set by our buttons
  key: "myra:nav:key", // last-processed history.state key (dedup)
  init: "myra:nav:init", // marks the first load of this window session
};

/**
 * Browser-style back / forward history controls for the top bar. Next's router
 * exposes `back()`/`forward()` but no `canGoBack`/`canGoForward`, so we track an
 * in-app position pointer ourselves and persist it in sessionStorage so it
 * survives the hard reloads the static export performs between routes.
 */
export function NavHistoryControls({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");

  const [{ back, forward }, setState] = useState({ back: false, forward: false });

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute on every route change.
  useEffect(() => {
    let ss: Storage;
    try {
      ss = window.sessionStorage;
    } catch {
      return;
    }

    // Next assigns a unique `key` to each history entry. StrictMode double-invoke
    // and incidental re-renders fire this effect with the same key — apply each
    // navigation's transition only once.
    let navKey = "";
    try {
      navKey = String((window.history.state as { key?: string } | null)?.key ?? "");
    } catch {
      navKey = "";
    }

    const read = (k: string) => Number(ss.getItem(k) ?? 0);
    let idx = read(K.idx);
    let max = read(K.max);

    if (navKey && ss.getItem(K.key) === navKey) {
      setState({ back: idx > 0, forward: idx < max });
      return;
    }

    const intent = ss.getItem(K.intent);
    ss.removeItem(K.intent);
    const inited = ss.getItem(K.init);

    if (!inited) {
      // First load of the window session: history origin, nowhere to go.
      idx = 0;
      max = 0;
      ss.setItem(K.init, "1");
    } else if (intent === "back") {
      idx = Math.max(0, idx - 1);
    } else if (intent === "forward") {
      idx = Math.min(max, idx + 1);
    } else {
      // A push (link/programmatic nav): advance and drop any forward history.
      idx += 1;
      max = idx;
    }

    ss.setItem(K.idx, String(idx));
    ss.setItem(K.max, String(max));
    if (navKey) ss.setItem(K.key, navKey);
    setState({ back: idx > 0, forward: idx < max });
  }, [pathname]);

  const goBack = useCallback(() => {
    try {
      window.sessionStorage.setItem(K.intent, "back");
    } catch {
      // ignore — pointer just won't update, navigation still works
    }
    router.back();
  }, [router]);

  const goForward = useCallback(() => {
    try {
      window.sessionStorage.setItem(K.intent, "forward");
    } catch {
      // ignore
    }
    router.forward();
  }, [router]);

  return (
    <div className={cn("flex items-center", className)}>
      <Button
        onClick={goBack}
        disabled={!back}
        variant="ghost"
        size="icon"
        aria-label={t("back")}
        title={t("back")}
        className="size-7 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        onClick={goForward}
        disabled={!forward}
        variant="ghost"
        size="icon"
        aria-label={t("forward")}
        title={t("forward")}
        className="size-7 text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
