# Myra Agents — Design System

This document describes the visual language of the app. The active reference is
the **Myra** theme — synced from the Figma "Theme" variable collection
(`docs/design/figma-exports/`): warm paper light mode, near-black dark mode, a
neutral-ink primary, semantic text/icon tiers, and **Lato** as the default type
family. Light mode is the default (`theme_mode: "light"`).

Themes are CSS presets keyed on `:root[data-theme-preset="<value>"]` (see
`src/styles/presets/`), registered in `THEME_PRESET_OPTIONS`
(`src/lib/preferences/theme.ts` — a generated block), and imported in
`src/app/layout.tsx`. Each preset ships a light block and a
`.dark:root[...]` block. Components consume the semantic shadcn tokens
(`--primary`, `--background`, `--sidebar`, …) plus the Figma semantic tokens
below — never raw hex — so swapping presets restyles the whole app.

Available presets: **Default** (fallback in `globals.css`, no preset file),
**Myra** (default), Caffeine, Claude, Supabase, Tangerine.

## Myra preset (default)

`src/styles/presets/myra.css` — `value: "myra"`. Synced from Figma
`theme.json`; Figma ships dark, light is derived.

### Surfaces & ink

| Role | Light | Dark |
|------|-------|------|
| `--background` | `#f7f7f4` (warm paper) | `#141414` |
| `--card` | `#ffffff` | `#181818` |
| `--popover` | `#fcfcfc` | `#1f1f1f` |
| `--secondary` / `--accent` | `#ebeae5` | `#e4e4e414` (alpha wash) |
| `--muted` | `#f0efeb` | `#e4e4e40f` |
| `--sidebar` | `#f2f1ed` | `#1b1d1e` |
| `--border` / `--input` | `#d3d4d5` / `#d7d6d5` | `#e4e4e41f` |
| `--foreground` (ink) | `#26251e` | `#e4e4e4` |
| `--primary` | `#26251e` (ink, not a hue) | `#e4e4e4` |

The primary is the **ink itself** — solid buttons read as near-black (light) /
near-white (dark). The only saturated chrome accents are `--ring` /
`--sidebar-primary` blues (`#3b82f6` / `#0097f5` light, `#5da1e5` dark) for
focus and active states. Dark-mode washes are **alpha over the ink**
(`#e4e4e414`-style), not opaque grays — they compose over any surface.

### Semantic tokens (Figma "Theme" refactor)

Defined in every preset *and* in the `globals.css` fallback; exposed as
Tailwind utilities via `@theme inline` (`text-text-tertiary`,
`bg-card-background`, `border-border-cards`, `bg-task-status-running`, …).

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--text-primary` | `#26251ef0` | `#e4e4e4f0` | main copy |
| `--text-secondary` | `#26251eb2` | `#e4e4e4b2` | supporting copy |
| `--text-tertiary` | `#26251e7a` | `#e4e4e47a` | metadata, hints |
| `--icon-primary` | `#43423c` | `#c7c7c7` | icon ink (opaque — avoids stroke double-darkening) |
| `--icon-tertiary` | `#65645e` | `#a6a6a6` | dimmed icons |
| `--card-background` | `#fcfcfc` | `#181818` | card fill |
| `--card-background-secondary` | `#ebeae4` | `#1f1f1f` | kanban column "task list" surface, one step behind cards |
| `--border-cards` | `#26251e0f` | `#e4e4e40a` | hairline card borders |

Text tiers are alpha ramps on the ink; icon inks are their **opaque**
composites (semi-transparent SVG strokes overlap and double-darken).

### Task-status colors (identical in both modes)

| Status | Hex |
|--------|-----|
| Backlog | `#888780` |
| Running | `#ff6900` (orange) |
| Needs you | `#7f77dd` (violet) |
| Done | `#639922` (green) |
| Destructive | `#cf2d56` light · `#e34671` dark |

Charts (`--chart-1..5`): blue → green → amber → mauve → terracotta.

### Shape & chrome dimensions

- **Radius:** `--radius: 0.375rem` (Myra preset; default fallback is
  `0.625rem`). Derived `sm/md/lg/xl…` follow the shadcn `calc()` ladder in
  `globals.css`.
- **App chrome float vars** (Figma `theme.json`, preset-invariant, in
  `globals.css` `:root`): `--app-sidebar-width: 280px`,
  `--mac-top-height: 42px`, `--window-radius: 15px`,
  `--kanban-radius: 10px`, `--card-radius: 12px` (exposed as `rounded-card`).
- **Shadows:** quiet single-layer drops (`0 1px 3px` + soft spread ladder up
  to `2xl`). Borders carry the separation; shadows stay subtle. The
  `--shadow-*` vars only apply outside the `default` preset (see the
  `[data-theme-preset]` shadow utilities in `globals.css`).
- **Window:** frameless Tauri window — transparent native window, one opaque
  rounded wrapper paints/clips the app so only the corners reveal the desktop
  (`html[data-tauri]` rules).

### Typography

Fonts are user-selectable (Settings → `data-font` attribute on `<html>`,
mapped in `globals.css` utilities). All options are registered in
`src/lib/fonts/registry.ts` (next/font, `--font-<name>` variables).

- **Default: Lato** (`font: "lato"` in `PREFERENCE_DEFAULTS`) — the Myra
  preset sets `--font-sans/mono/serif: var(--font-lato)`.
- The default *preset* fallback uses **Geist** / **Geist Mono**.
- ~20 selectable families: Inter, Noto Sans, Nunito Sans, Figtree, Roboto,
  Geist, Raleway, DM Sans, Public Sans, Outfit, Geist Mono, Geist Pixel
  Square, JetBrains Mono, Noto Serif, Roboto Slab, Merriweather, Lora,
  Playfair Display, Sorts Mill Goudy, Lato, Crimson Text.
- Weights restrained: 400 body, 600 headings/emphasis.

### App-wide behaviors (globals.css)

- Text is **not selectable** (desktop-app feel); inputs/textarea/
  contenteditable stay selectable. Images/links have no drag ghost.
- Thin overlay scrollbars: transparent track, `--scrollbar-thumb` from the
  foreground at 24% alpha, primary-tinted on hover.
- Pointer cursor on all clickables (Tailwind v4 preflight no longer sets it).
- **Myra loaders**: the 7-chevron logo animates via `myra-shimmer` (default)
  or `myra-assemble` keyframes (`components/ui/myra-loader.tsx`,
  `loader_variant` preference); disabled under `prefers-reduced-motion`.

## Components

Built on **shadcn/ui** primitives in `src/components/ui/` (`style:
"radix-nova"`, `baseColor: neutral`, Lucide icons — see `components.json`).

- **Buttons** — primary = solid ink (`--primary`); secondary = neutral
  `--secondary` fill; ghost = transparent with the neutral wash. Compact
  height, `rounded-md`.
- **Cards / Kanban cards** — `--card-background` fill, 1px `--border-cards`
  hairline, `rounded-card` (12px), quiet shadow; hover uses the neutral
  wash, not a colored border. Columns sit on
  `--card-background-secondary` so buckets read as containers.
- **Sidebar** — `--sidebar` surface (280px), active item uses
  `--sidebar-primary` blue for indicator/icon, neutral wash for hover.
- **Inputs / selects** — `--input` border, blue `--ring` on focus.
- **Badges / status pills** — map card/agent states onto the
  `--task-status-*` colors, low-saturation fills.
- **Text/icons** — use the tier utilities (`text-text-secondary`,
  `text-icon-tertiary`), not opacity modifiers on `--foreground`.

When adding UI, pull the matching shadcn component into `components/ui/` and
let it inherit the tokens — avoid bespoke colors. All user-facing copy goes
through `next-intl` (`src/messages/{en,fr}.json`).

## Adding or editing a preset

1. Create `src/styles/presets/<value>.css` with
   `:root[data-theme-preset="<value>"]` and a
   `.dark:root[data-theme-preset="<value>"]` block (copy `myra.css`).
2. Import it in `src/app/layout.tsx`.
3. Register it in `THEME_PRESET_OPTIONS` (`src/lib/preferences/theme.ts`)
   with its `--primary` light/dark swatch — note the file's
   `generated:themePresets` markers.
4. Define the **full** semantic token set — shadcn tokens *plus* the Figma
   semantic tokens (text/icon tiers, card surfaces, `--task-status-*`) and
   the `--shadow-*` ladder — so light/dark and the shadow utilities in
   `globals.css` resolve.
