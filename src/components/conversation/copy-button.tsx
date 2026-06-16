"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Small copy-to-clipboard affordance used on code blocks and tool I/O. */
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently no-op.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
        className,
      )}
      aria-label="Copy"
    >
      {copied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
    </button>
  );
}
