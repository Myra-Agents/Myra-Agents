"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { TARGET_TIMEOUT_MS, TOUR_APPLY_EVENT, TOUR_FLOWS } from "@/lib/tour-steps";
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
  const { flow, index, nextStep, prevStep, endFlow } = useTourStore();

  const [rect, setRect] = useState<Rect | null>(null);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  // Whether a `requireSatisfied` step's condition is met yet, as reported by the
  // screen that owns the state.
  const [satisfied, setSatisfied] = useState(false);
  // Which side Radix actually landed on — it flips on collision, and the
  // suggestion's arrow has to point back at the target, not at where we asked
  // for the popover to go.
  const [side, setSide] = useState<keyof typeof ARROW_FOR_SIDE>("right");
  const contentRef = useRef<MutationObserver | null>(null);
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
    // Clear the previous step's rect right away — otherwise a target that's
    // slow to appear (or never does, e.g. a run that hasn't synced back yet)
    // leaves the old ring floating over whatever used to be there instead of
    // just showing nothing while this step looks for its own target.
    setRect(null);
    setTargetEl(null);
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
        // Read alongside the rect: the app flips this as its own state changes,
        // and the same frame loop that tracks the target already runs.
        const ok = el.dataset.tourSatisfied === "true";
        setSatisfied((prev) => (prev === ok ? prev : ok));
        const r = el.getBoundingClientRect();
        const pad = step.padding ?? 0;
        let top = r.top - pad;
        let left = r.left - pad;
        let right = r.right + pad;
        let bottom = r.bottom + pad;
        // A control that opens a menu means the menu is now part of the thing
        // being pointed at: fold it into the rect so it's lit rather than dimmed,
        // and so the popover is placed clear of it instead of straight on top —
        // both anchor to this control, so they collide by construction.
        // Any menu open during a step is the one the step just asked for.
        //
        // Not when the target lives *inside* the menu (the "Run now" item): the
        // rect is the ring too, and swallowing the menu would blur a precise
        // point-at-this into a box around everything.
        const menu = document.querySelector<HTMLElement>('[role="menu"], [role="listbox"]');
        if (menu && !menu.contains(el)) {
          const m = menu.getBoundingClientRect();
          if (m.width > 0 && m.height > 0) {
            top = Math.min(top, m.top);
            left = Math.min(left, m.left);
            right = Math.max(right, m.right);
            bottom = Math.max(bottom, m.bottom);
          }
        }
        setRect({ top, left, width: right - left, height: bottom - top });
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

  // Radix writes the resolved side onto the content as `data-side` and rewrites
  // it when it flips, so watch the attribute rather than re-deriving its
  // collision logic here and drifting from it. A callback ref, not an effect:
  // the content mounts only once a rect exists, long after this component does.
  const setContentNode = useCallback((node: HTMLDivElement | null) => {
    contentRef.current?.disconnect();
    contentRef.current = null;
    if (!node) return;
    const read = () => {
      const s = node.dataset.side;
      if (s && s in ARROW_FOR_SIDE) setSide(s as keyof typeof ARROW_FOR_SIDE);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(node, { attributes: true, attributeFilter: ["data-side"] });
    contentRef.current = observer;
  }, []);

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
          ref={setContentNode}
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
              on a missing key rather than returning empty.
              `example` is prose (a hint about a step you can't paste into);
              `exampleValue` is a literal the user can lift straight into the
              ringed field, so it gets the quotes and the copy button. */}
          {t.has(`${step.id}.example`) && (
            <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-muted-foreground text-xs italic leading-relaxed">
              {t(`${step.id}.example`)}
            </p>
          )}
          {t.has(`${step.id}.exampleValue`) && (
            <ExampleValue t={t} value={t(`${step.id}.exampleValue`)} targetEl={targetEl} side={side} />
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
            <div className="flex items-center gap-1">
              {/* Not on the first step, where there's nowhere back to. Sits
                  alongside Skip rather than replacing it: Skip is the only way
                  out of an interactive step, so it can never be traded away. */}
              {index > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => prevStep(index)}>
                  <ArrowLeftIcon />
                  {t("back")}
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={skip}>
                {t("skip")}
              </Button>
              {/* Interactive steps have no Next — acting on the ringed element
                  is the whole point, and a Next would let the user skip past it.
                  Same for a step that isn't satisfied yet. */}
              {!step.interactive && !step.awaitVanish && (!step.requireSatisfied || satisfied) && (
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

/**
 * Write a value into a React-controlled field.
 *
 * Assigning `.value` is invisible to React — it tracks the previous value on the
 * node and skips the change. Going through the prototype's native setter is what
 * makes the dispatched `input` event look like real typing, so `onChange` fires
 * and the draft actually updates.
 */
function setControlledValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Popover side → the arrow that points back at the ringed element. */
const ARROW_FOR_SIDE = {
  right: ArrowLeftIcon,
  left: ArrowRightIcon,
  top: ArrowDownIcon,
  bottom: ArrowUpIcon,
} as const;

/**
 * A suggested value for the ringed field, with an arrow that points at it and
 * fills it in — the suggestion applies itself rather than asking the user to
 * retype or paste it.
 *
 * The quotes and the "Try:" label are chrome, not content: the message holds the
 * bare value, so what reaches the field is exactly the suggestion.
 */
function ExampleValue({
  t,
  value,
  targetEl,
  side,
}: {
  t: ReturnType<typeof useTranslations>;
  value: string;
  targetEl: HTMLElement | null;
  side: keyof typeof ARROW_FOR_SIDE;
}) {
  const [applied, setApplied] = useState(false);
  const Arrow = ARROW_FOR_SIDE[side];

  const apply = useCallback(() => {
    if (!targetEl) return;

    // The ringed element is usually the field itself, but a step may ring a row
    // that contains it.
    const field =
      targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement
        ? targetEl
        : targetEl.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (field) {
      setControlledValue(field, value);
      field.focus();
      setApplied(true);
      return;
    }

    // Tags have no standing field: the row shows an "add" button that swaps
    // itself for an autofocused input. Open it, fill it, and commit with Enter
    // the way a user would, then blur so the row settles back.
    const add = targetEl.querySelector<HTMLElement>("[data-tour-add-tag]");
    if (add) {
      add.click();
      requestAnimationFrame(() => {
        const revealed = document.activeElement;
        if (!(revealed instanceof HTMLInputElement)) return;
        setControlledValue(revealed, value);
        revealed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        revealed.blur();
        setApplied(true);
      });
      return;
    }

    // Nothing to type into — hand it to whoever owns the state (the trigger is
    // a schedule object, not text). No listener means no arrow, so a step that
    // gets here has one.
    targetEl.dispatchEvent(new CustomEvent(TOUR_APPLY_EVENT, { bubbles: false }));
    setApplied(true);
  }, [targetEl, value]);

  // Back to the arrow, so applying again still reads as an action.
  useEffect(() => {
    if (!applied) return;
    const timer = setTimeout(() => setApplied(false), 1600);
    return () => clearTimeout(timer);
  }, [applied]);

  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5">
      <p className="min-w-0 flex-1 text-muted-foreground text-xs italic leading-relaxed">
        {t("tryThis")} “{value}”
      </p>
      <button
        type="button"
        onClick={apply}
        disabled={!targetEl}
        aria-label={applied ? t("applied") : t("applyExample")}
        title={applied ? t("applied") : t("applyExample")}
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
      >
        {applied ? (
          <CheckIcon className="size-3.5 text-green-600 dark:text-green-500" />
        ) : (
          <Arrow className="size-3.5" />
        )}
      </button>
    </div>
  );
}
