"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MyraLoader, type MyraLoaderVariant } from "./myra-loader";

interface MyraThinkingProps {
  /** Playful messages to cycle through. Cycling only kicks in with 2+ messages. */
  messages?: string[];
  /** Loader size in px. */
  size?: number;
  /** Delay between messages in ms. */
  intervalMs?: number;
  /** Loader animation style — see MyraLoader. */
  variant?: MyraLoaderVariant;
  className?: string;
}

/**
 * In-progress indicator: the animated Myra mark next to a fun message that
 * rotates every few seconds. Generic — pass any `messages` (e.g. from i18n).
 */
function MyraThinking({ messages, size = 18, intervalMs = 2800, variant = "shimmer", className }: MyraThinkingProps) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!messages || messages.length <= 1) return;
    setI(0);
    const id = window.setInterval(() => {
      setI((v) => (v + 1) % messages.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [messages, intervalMs]);

  const msg = messages?.[i];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MyraLoader size={size} variant={variant} className="shrink-0 text-orange-500" />
      {msg && (
        <span
          key={i}
          className="text-[11px] text-muted-foreground italic animate-in fade-in duration-500"
        >
          {msg}
        </span>
      )}
    </div>
  );
}

export { MyraThinking };
