"use client";

import { useCallback, useEffect, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { TARGET_TIMEOUT_MS, TOUR_FLOWS } from "@/lib/tour-steps";
import { useTourStore } from "@/stores/tour-store";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The spotlight walkthrough: dims the app, cuts a hole around the step's
 * target, rings it, and explains it in a popover beside it.
 *
 * The hole is four blocking panels laid *around* the target rect rather than
 * one full-screen overlay with a clip-path. That way the target is genuinely
 * uncovered — it stays clickable with no z-index games, which matter here
 * because the sidebar and the header each create their own stacking context and
 * "raise the target above the overlay" quietly fails inside them.
 *
 * Rects are re-measured every frame while a step is active. That looks
 * heavy-handed but it's the only thing that survives everything the app does
 * underneath: the sidebar collapsing to its icon rail, the inset scrolling, the
 * window resizing, and rows re-rendering as runs finish.
 */
export function SpotlightTour() {
  const t = useTranslations("tour.spotlight");
  const router = useRouter();
  const pathname = usePathname();
  const { flow, index, nextStep, endFlow } = useTourStore();

  const [rect, setRect] = useState<Rect | null>(null);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const step = flow ? TOUR_FLOWS[flow][index] : null;
  const isLast = flow ? index + 1 >= TOUR_FLOWS[flow].length : false;

  // Get to the step's route first — its target may not exist anywhere else.
  useEffect(() => {
    if (!step?.route) return;
    const here = pathname.replace(/\/$/, "");
    if (here !== step.route) router.push(step.route);
  }, [step, pathname, router]);

  // Track the target's rect for as long as the step is active, and give up on
  // a target that never shows (a page without runs has no row to point at).
  useEffect(() => {
    if (!step) {
      setRect(null);
      setTargetEl(null);
      return;
    }
    let raf = 0;
    let found = false;
    const startedAt = performance.now();

    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        if (!found) {
          found = true;
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        setTargetEl((prev) => (prev === el ? prev : el));
        const r = el.getBoundingClientRect();
        const pad = step.padding ?? 0;
        setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
      } else if (!found && performance.now() - startedAt > TARGET_TIMEOUT_MS) {
        // Never appeared — move on rather than hold the user under a dimmed
        // screen pointing at nothing.
        nextStep(index);
        return;
      } else if (found) {
        // Vanished mid-step (re-render, or the click navigated away): end the
        // step cleanly. `index` makes this a no-op when the click listener has
        // already advanced us.
        nextStep(index);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, nextStep, index]);

  // On interactive steps the user's real press on the target is what advances
  // the tour, so listen for it instead of rendering a "Next".
  //
  // `pointerdown`, not `click`: a Radix menu trigger opens on pointerdown and
  // preventDefaults it, so the pointerup lands on the menu's dismissable layer
  // and the trigger never emits a click at all — a click listener on it fires
  // exactly zero times. Pressing the ringed element is the signal we mean.
  useEffect(() => {
    if (!step?.interactive || !targetEl) return;
    const onPress = () => nextStep(index);
    targetEl.addEventListener("pointerdown", onPress);
    return () => targetEl.removeEventListener("pointerdown", onPress);
  }, [step?.interactive, targetEl, nextStep, index]);

  // Escape gets out of the tour — but only when it isn't already dismissing
  // something else. Steps ring dropdowns (the folder picker, the row menu), and
  // Escape is how you close one; without this guard, closing a menu the tour
  // just told you to open would kill the tour with it.
  useEffect(() => {
    if (!flow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="menu"], [role="listbox"]')) return;
      endFlow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow, endFlow]);

  const skip = useCallback(() => endFlow(), [endFlow]);

  if (!flow || !step || !rect) return null;

  // Never dim the Tauri title bar — the traffic lights live there and must stay
  // usable while the tour runs.
  const top = "var(--titlebar-h, 0px)";
  const panel = "fixed bg-black/55";

  return (
    <>
      {/* The four panels around the hole. They block clicks; the hole doesn't. */}
      <div
        className={panel}
        style={{ top, left: 0, right: 0, height: `max(0px, calc(${rect.top}px - ${top}))`, zIndex: 60 }}
      />
      <div className={panel} style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0, zIndex: 60 }} />
      <div className={panel} style={{ top: rect.top, left: 0, width: rect.left, height: rect.height, zIndex: 60 }} />
      <div
        className={panel}
        style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height, zIndex: 60 }}
      />

      {/* The ring. Pointer-events off so it never eats the click it invites. */}
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-md"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          zIndex: 61,
          boxShadow: "0 0 0 2px var(--primary), 0 0 0 6px color-mix(in srgb, var(--primary) 30%, transparent)",
        }}
      />

      <Popover open>
        <PopoverAnchor asChild>
          <div
            className="pointer-events-none fixed"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, zIndex: 61 }}
          />
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          className="z-[62] w-72"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <p className="text-muted-foreground text-xs">
            {t("progress", { current: index + 1, total: TOUR_FLOWS[flow].length })}
          </p>
          <p className="mt-1 font-medium text-sm">{t(`${step.id}.title`)}</p>
          <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{t(`${step.id}.body`)}</p>
          {/* Only some steps carry a worked example — `has` because t() throws
              on a missing key rather than returning empty. */}
          {t.has(`${step.id}.example`) && (
            <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-muted-foreground text-xs italic leading-relaxed">
              {t(`${step.id}.example`)}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1">
              {TOUR_FLOWS[flow].map((s, i) => (
                <span
                  key={s.id}
                  aria-hidden
                  className={
                    i === index ? "size-1.5 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground/25"
                  }
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={skip}>
                {t("skip")}
              </Button>
              {/* Interactive steps have no Next — acting on the ringed element
                  is the whole point, and a Next would let the user skip past it. */}
              {!step.interactive && !step.awaitVanish && (
                <Button type="button" size="sm" onClick={() => nextStep(index)}>
                  {isLast ? t("done") : t("next")}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
