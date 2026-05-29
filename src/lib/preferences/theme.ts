export const THEME_MODE_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const;

export const THEME_MODE_VALUES = THEME_MODE_OPTIONS.map((o) => o.value);
export type ThemeMode = (typeof THEME_MODE_VALUES)[number];
export type ResolvedThemeMode = "light" | "dark";

// --- generated:themePresets:start ---

export const THEME_PRESET_OPTIONS = [
  {
    label: "Default",
    value: "default",
    primary: {
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.922 0 0)",
    },
  },
  {
    label: "Tangerine",
    value: "tangerine",
    primary: {
      light: "oklch(0.64 0.17 36.44)",
      dark: "oklch(0.64 0.17 36.44)",
    },
  },
  {
    label: "Caffeine",
    value: "caffeine",
    primary: {
      light: "oklch(0.4341 0.0392 41.9938)",
      dark: "oklch(0.9247 0.0524 66.1732)",
    },
  },
  {
    label: "Claude",
    value: "claude",
    primary: {
      light: "oklch(0.6171 0.1375 39.0427)",
      dark: "oklch(0.6724 0.1308 38.7559)",
    },
  },
  {
    label: "Supabase",
    value: "supabase",
    primary: {
      light: "oklch(0.8348 0.1302 160.908)",
      dark: "oklch(0.4365 0.1044 156.7556)",
    },
  },
] as const;

export const THEME_PRESET_VALUES = THEME_PRESET_OPTIONS.map((p) => p.value);

export type ThemePreset = (typeof THEME_PRESET_OPTIONS)[number]["value"];

// --- generated:themePresets:end ---
