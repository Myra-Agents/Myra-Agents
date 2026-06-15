# Myra Agents — Design System

This document describes the visual language of the app. The active reference is
the **Cursor app** aesthetic (extracted from `cursor.com` design tokens): a flat,
high-contrast, near-neutral surface palette with a calm **blue** accent (the
Cursor editor accent, not the marketing-site orange), tight radii, and the Geist
type family.

Themes are CSS presets keyed on `:root[data-theme-preset="<value>"]` (see
`src/styles/presets/`), registered in `src/lib/preferences/theme.ts`, and
imported in `src/app/layout.tsx`. Each preset ships a light and a `.dark` block.
Components consume the semantic shadcn tokens (`--primary`, `--background`,
`--sidebar`, …) — never raw hex — so swapping presets restyles the whole app.

## Cursor preset

`src/styles/presets/cursor.css` — `value: "cursor"`.

### Accent color

| Token | Hex | OKLCH | Use |
|-------|-----|-------|-----|
| Accent blue | `#3c7cab` light · `#599ce7` dark | `oklch(0.5651 0.0982 243)` / `oklch(0.6812 0.131 252.63)` | `--primary`, `--ring`, active states, selection |

This is the **Cursor editor** accent — the blue you see inside the app (selection,
progress, focus). It is the only saturated hue in the chrome; everything else is
neutral gray. Use it sparingly: primary buttons, focus rings, selected/active
affordances. Don't tint large surfaces with it.

> The marketing-site orange `#f54e00` (`oklch(0.6522 0.2135 37.99)`) is Cursor's
> brand color but is **not** used in the product UI — we keep it only as the last
> chart series (`--chart-5`), not as the primary.

### Surfaces (neutral ladder)

| Role | Light | Dark |
|------|-------|------|
| `--background` | `#ffffff` | `#181818` |
| `--card` / `--popover` | `#ffffff` | `#1f1f1f` |
| `--secondary` / `--muted` | `#f7f7f7` / `#f3f3f3` | `#262626` |
| `--accent` (hover wash) | `#f3f3f3` | `#2e2e2e` |
| `--sidebar` | `#f7f7f7` | `#141414` (darker than bg) |
| `--border` / `--input` | `#e5e7eb` | `#2e2e2e` |
| `--foreground` (base text) | `#141414` | `#e4e4e4` |
| `--muted-foreground` | `#666666` | `#b3b3b3` |

Cursor's chrome reads as layered grays: the sidebar sits a notch off the editor
background (lighter in light mode, darker in dark mode), cards/popovers lift one
step, and hover states are a faint neutral wash — not a colored tint.

### Status & data colors

| Role | Hex | Use |
|------|-----|-----|
| Success / added | `#1f8a65` | success, diff additions |
| Danger / removed | `#cf2d56` | `--destructive`, diff deletions |
| Warning / modified | `#c08532` | warnings |
| Purple | `#7754d9` | secondary data series |

Charts (`--chart-1..5`) cycle blue → green → purple → amber → orange.

### Shape & elevation

- **Radius:** `--radius: 0.5rem` (tight). Derived `sm/md/lg/xl` follow the
  shadcn `calc()` ladder in `globals.css`.
- **Shadows:** subtle, layered — a 2px ambient ring plus a soft drop, mirroring
  Cursor's `0 0 2px #0000000f, 0 6px 16px #0000000f` card shadow. Dark mode uses
  heavier opacities. Borders carry most of the separation; shadows stay quiet.
- **Borders over shadows:** containers are separated by 1px hairline borders
  first, elevation second.

### Typography

- **Sans:** Geist (`--font-geist`) — UI text.
- **Mono:** Geist Mono (`--font-geist-mono`) — code, agent logs, terminal output.

Cursor's own site uses `cursorGothicBeta` (proprietary) over a Geist fallback; we
adopt Geist directly. Weights stay restrained: 400 body, 600 for headings/emphasis.

## Components

The app is built on **shadcn/ui** primitives in `src/components/ui/`
(`style: "radix-nova"`, `baseColor: neutral`, Lucide icons — see
`components.json`). To match Cursor:

- **Buttons** — primary = solid orange; secondary = neutral `--secondary` fill;
  ghost = transparent with a neutral hover wash. Compact height, `rounded-md`.
- **Cards / Kanban cards** — `--card` fill, 1px `--border`, `rounded-lg`, quiet
  shadow; hover lifts with the neutral `--accent` wash, not a colored border.
- **Sidebar** — `--sidebar` surface, active item uses `--sidebar-primary`
  (orange) for the indicator/icon, neutral wash for hover.
- **Inputs / selects** — `--input` border, orange `--ring` on focus.
- **Badges / status pills** — map lane/agent states onto the status colors above
  (success/danger/warn/blue), low-saturation fills.

When adding UI, pull the matching shadcn component into `components/ui/` and let
it inherit the tokens — avoid bespoke colors.

## Adding or editing a preset

1. Create `src/styles/presets/<value>.css` with `:root[data-theme-preset="<value>"]`
   and a `.dark:root[data-theme-preset="<value>"]` block (copy `cursor.css`).
2. Import it in `src/app/layout.tsx`.
3. Register it in `THEME_PRESET_OPTIONS` (`src/lib/preferences/theme.ts`) with its
   `--primary` light/dark swatch.
4. Define the full semantic token set so light/dark and the shadow utilities in
   `globals.css` resolve.
