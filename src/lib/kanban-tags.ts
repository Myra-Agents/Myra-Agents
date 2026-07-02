"use client";

import { cn } from "@/lib/utils";

export const TAG_PALETTE = [
  "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  "border-lime-500/25 bg-lime-500/10 text-lime-700 dark:text-lime-300",
] as const;

// Saturated swatches for the color-picker circles.
export const TAG_SWATCH_CLASSES = [
  "bg-orange-500 border-orange-600",
  "bg-blue-500 border-blue-600",
  "bg-emerald-500 border-emerald-600",
  "bg-purple-500 border-purple-600",
  "bg-amber-500 border-amber-600",
  "bg-rose-500 border-rose-600",
  "bg-cyan-500 border-cyan-600",
  "bg-lime-500 border-lime-600",
] as const;

// Representative hex values for the palette (used as default for the custom color picker).
export const PALETTE_HEX = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#10b981", // emerald
  "#a855f7", // purple
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#06b6d4", // cyan
  "#84cc16", // lime
] as const;

export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseTags(value: string): string[] {
  const tags = value.split(/[,\n]/).map(normalizeTag).filter(Boolean);
  return [...new Set(tags)];
}

export function tagHashIndex(tag: string): number {
  let hash = 2166136261;
  for (const char of normalizeTag(tag)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % TAG_PALETTE.length;
}

export function tagClassName(tag: string, className?: string, colorIndex?: number): string {
  const index = colorIndex ?? tagHashIndex(tag);
  return cn(TAG_PALETTE[index % TAG_PALETTE.length], className);
}
