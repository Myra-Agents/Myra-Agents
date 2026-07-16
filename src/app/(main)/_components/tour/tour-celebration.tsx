"use client";

import { useEffect, useState } from "react";

import { Confetti } from "@/components/ui/confetti";
import { useTourStore } from "@/stores/tour-store";

import { useGetStarted } from "./get-started-card";

/** Long enough for the burst to fall off-screen before the canvas goes. */
const CLEAR_AFTER_MS = 5000;

/**
 * Confetti when the last box on the "Get started" checklist ticks.
 *
 * Fires on the whole tour completing, not on each walkthrough — three bursts
 * would be noise, and finishing all three is the thing worth marking.
 *
 * Completing also switches the tour off. That's what it means for a tour to be
 * over, and it's what stops this firing again: the checklist hides itself at
 * 3/3 but the opt-in flag would otherwise stay on, so every launch from then on
 * would rehydrate into a "complete" tour and throw confetti at someone who did
 * nothing. Replaying from Settings turns it back on and clears the progress.
 */
export function TourCelebration() {
  const { steps, doneCount } = useGetStarted();
  const enabled = useTourStore((s) => s.enabled);
  const hydrated = useTourStore((s) => s.hydrated);
  const stop = useTourStore((s) => s.stop);
  const [firing, setFiring] = useState(false);

  useEffect(() => {
    if (!hydrated || !enabled || doneCount < steps.length) return;
    setFiring(true);
    stop();
  }, [hydrated, enabled, doneCount, steps.length, stop]);

  useEffect(() => {
    if (!firing) return;
    const timer = setTimeout(() => setFiring(false), CLEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [firing]);

  if (!firing) return null;

  return (
    <Confetti
      // Mounting is what fires it — the component bursts on mount unless
      // `manualstart`, so there's no ref to poke here.
      className="pointer-events-none fixed inset-0 z-[70]"
      options={{
        particleCount: 120,
        spread: 90,
        startVelocity: 45,
        origin: { x: 0.5, y: 0.7 },
      }}
    />
  );
}
