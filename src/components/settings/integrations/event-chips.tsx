"use client";

import { COLUMN_CONFIG, COLUMN_STATUSES } from "@myra/shared/types/kanban";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A real chips/checkbox multiselect for card-status events — replaces the old
 * comma-separated text fallback. Toggling a chip flips that status in `value`.
 * Options default to the board column statuses (the events outbound webhooks fire
 * on); pass `options` to constrain to a plugin's declared set.
 */
export function EventChips({
  value,
  onChange,
  options = COLUMN_STATUSES,
  ariaLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options?: readonly string[];
  ariaLabel?: string;
}) {
  const selected = new Set(value);
  const toggle = (status: string) => {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    // Preserve option order for a stable, deterministic value.
    onChange(options.filter((o) => next.has(o)));
  };

  return (
    <fieldset className="flex min-w-0 flex-wrap gap-1.5 border-0 p-0" aria-label={ariaLabel}>
      {options.map((status) => {
        const isOn = selected.has(status);
        const label = COLUMN_CONFIG[status as keyof typeof COLUMN_CONFIG]?.label ?? status.replace(/_/g, " ");
        return (
          <button
            key={status}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(status)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
              isOn
                ? "border-primary/45 bg-primary/15 text-foreground"
                : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
            )}
          >
            {isOn && <CheckIcon className="size-3 text-primary" />}
            {label}
          </button>
        );
      })}
    </fieldset>
  );
}
