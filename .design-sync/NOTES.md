# design-sync notes — Myra Agents UI Primitives

Target project: `Myra Agents UI Primitives` (5d9566ce-249b-43fc-8cca-bd9a21d030ea).
This is a SEPARATE project from the hand-crafted `Myra Agents Design System`
(cda5b932) — do NOT sync into that one; it holds bespoke agent components/ui_kits.

## Source shape
- This is the Myra **app** repo (Next.js 16 + Tauri), not a packaged component library.
- No `dist/` of exported components → **synth-entry mode** (converter synthesizes an
  entry from `src/components/ui/**`). `srcDir = src/components/ui`.
- Components are **shadcn/ui (Tailwind CSS v4)** — styling is Tailwind utility classes
  + CSS custom properties (tokens), NOT a shipped per-component stylesheet.
- `@/*` → `./src/*` (tsconfig paths). `cn` helper at `@/lib/utils`.

## Styling / CSS
- No component CSS ships. `cfg.cssEntry` must be a **compiled Tailwind stylesheet**
  covering every utility used by `src/components/ui/**` + the token `:root`/`.dark`
  vars. Generated with the Tailwind v4 CLI from `src/app/globals.css` (which imports
  `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, the `@theme inline` token
  map, and the default preset `:root` vars) → `.design-sync/ds-compiled.css`.
- Regenerate on re-sync:
  `npx @tailwindcss/cli -i src/app/globals.css -o .design-sync/ds-compiled.css --minify`
  (from repo root; auto-scans `src/` for used classes).

## Fonts
- App uses Google Fonts via `next/font` (`src/lib/fonts/registry.ts`); `--font-sans`
  is injected at runtime. The bundle has no `@font-face` → default family falls back.
  If `[FONT_MISSING]` fires, wire the default family via a Google `@import` or
  `cfg.runtimeFontPrefixes`.

## Re-sync risks
- `ds-compiled.css` is generated, not committed source — always regenerate it from
  `globals.css` before building, or previews render unstyled.
- Token vars are the DEFAULT preset only; preset themes (myra/supabase/…) are not shipped.

## Preview authoring — calibration learnings (solo set: Button, Card, Alert, Badge)
- Import from `"myra-agents"` (the pkg global window.MyraUI). Named exports = graded cells.
- Components render fully styled out of the box — Tailwind CSS + tokens ship in _ds_bundle.css.
  No provider needed for plain primitives.
- Layout wrappers: use inline `style={{ display:"flex", gap:8, ... }}` on a plain `<div>`.
- Compound components: compose the WHOLE parent (Card → Header/Title/Description/Action/Content/Footer).
- Subcomponents (AlertTitle, CardFooter, DialogHeader…) render blank alone → author their preview
  as the full PARENT composition (that's the only true render). Reuse the parent's composition.
- Content: Myra-flavored (agents, runs, tasks, schedules, sidecar, kanban lanes). Never foo/bar.
- Budget 2–3 cells for primaries; 1–2 for pure subcomponents.
- Radix overlays (Dialog/Popover/Dropdown/Tooltip/Sheet/Drawer/Menubar/ContextMenu) render CLOSED
  by default → the card is empty. Set `defaultOpen`/`open` on the root and render inline, OR set
  cfg.overrides.<Name> = {"cardMode":"single","viewport":"WxH"} (orchestrator-only). Prefer
  forcing open via props inside the preview when the component supports it.
- Animated components (MyraLoader, MyraThinking, Spinner): capture a static frame; give them a
  visible size/color so the frame isn't empty.

## Fan-out learnings — wave 1 (batches 6,7,8; 89 components, all good except Toaster)
- **Radix overlays render fully IN-CARD with `defaultOpen` on the root** (proven on alert-dialog):
  portalled overlay + centered content land inside the capture card. No cfg.overrides needed.
  Applies to Dialog/Drawer/Sheet/Popover/HoverCard/Tooltip/DropdownMenu/ContextMenu/Menubar/Select.
- **Charts (recharts):** recharts primitives are NOT in the myra-agents bundle — import them
  directly from `"recharts"` in the preview (bundles from source). ChartContainer's aspect-video
  collapses to 0 height in headless capture → override `className="!aspect-auto"` + explicit
  `style={{width,height}}` + `initialDimension`; set width/height on the inner chart and
  `isAnimationActive={false}`. Cosmetic: bars fall back to recharts grey, not --chart-* hues
  (ChartStyle inline var didn't apply in static frame). Acceptable; graded good.
- **Disclosure:** Accordion `type="single" defaultValue`, Collapsible `defaultOpen`, Tabs
  `defaultValue` on root. Resizable needs explicit wrapper height. Carousel (embla) needs
  ~56px horizontal padding so -left-12/-right-12 controls don't clip. Calendar: `defaultMonth`+`selected`.
- **Animated** (Spinner/MyraLoader/MyraThinking): static frame paints with visible size (≥28-48px)
  + explicit color (MyraLoader fill=currentColor → set text color). MyraThinking needs `messages` array.
- **Images in previews:** inline `data:image/svg+xml` URI paints synchronously in static capture
  (AvatarImage pattern) — use instead of network fetches.

## Known render warns (triaged legitimate)
- **Toaster (sonner):** renders an empty `position:fixed` portal — nothing paints until a toast is
  dispatched, which a static capture can't do. This is correct behavior for a toast host. Ships
  with a minimal/floor card; DEFERRED (not a defect). A real toast would need a capture harness
  calling `toast()` after mount — out of scope.

## Fan-out learnings — wave 2 (batches 1,2,3; 128 components, all good)
- **Menubar** open state is root-controlled: `<Menubar defaultValue="run">` + `<MenubarMenu value="run">`
  (MenubarMenu defaultOpen alone does nothing).
- **ContextMenu** opens on a virtual pointer — dispatch a synthetic `contextmenu` MouseEvent on the
  trigger ref in a mount `useEffect` to open it in-card.
- **Submenus** (DropdownMenuSub/ContextMenuSub/MenubarSub + Sub*Content): the SubContent panel does
  not paint statically (needs real hover). SubTrigger shows; subcomponents ride the parent menu scene.
- **Sidebar**: use `<Sidebar collapsible="none">` inside a size-constrained `SidebarProvider` — avoids
  the position:fixed offcanvas path that escapes the capture crop. No cfg.provider needed.
- **CommandDialog** portals to body with fixed top-1/3 centering → escapes the capture crop even with
  defaultOpen. Render the palette content inline instead. (Optional: cfg.overrides.CommandDialog =
  {"cardMode":"single","viewport":"1000x700"} if real dialog chrome wanted.)
- **Dialog/Drawer/Sheet/Popover/HoverCard/Tooltip**: all render open & in-card with `defaultOpen` on root.

## Fan-out learnings — wave 3 (batches 4,5; 78 components, all good)
- **Combobox** is Base UI (@base-ui/react), behaves like Radix: `defaultOpen` on root renders
  portalled ComboboxContent in-card. Static ComboboxItem children; `items={[]}` forces empty state;
  chips via `multiple` + ComboboxValue render-prop.
- **Select** `defaultOpen` opens SelectContent in-card. SelectScrollUp/DownButton only paint on real
  overflow (headless has room) → they ride the parent open-menu scene (like submenu content).
- **Icons in previews:** inline `<svg>` paints synchronously — avoids lucide-react imports.
  Input/Switch/Badge etc. are all on the myra-agents bundle for composition.
- **Field/Item/Empty/Breadcrumb/Pagination**: static compounds, render inline, no tricks needed.

## Known render warns (triaged legitimate — re-sync should not flag as new)
- **[TOKENS_MISSING] 26 vars**: all runtime-injected, expected absent from shipped CSS —
  `--radix-*` (Radix injects at render), `--tw`/`--shadow` (Tailwind internals),
  `--font-inter`/`--font-noto-sans`/`--font-nunito-sans`/… (app next/font vars set at runtime).
  Components render correctly (confirmed in screenshots). Non-blocking.
- **[RENDER_THIN] MyraLoader**: authored preview; the 7-chevron SVG mark paints via currentColor
  (both shimmer/assemble variants) but the check sees no text nodes → thin. Benign animation.
- **Toaster** floor-carded on purpose (render-nothing toast host) — see above.

## Re-sync setup (fresh clone — recreate these gitignored scratch bits first)
Synth-entry mode needs PKG_DIR to resolve to a SMALL package (repo root would make ts-morph
walk src-tauri/target and explode with ENAMETOOLONG). So:
1. Scratch pkg: `mkdir -p .design-sync/pkg && printf '{"name":"myra-agents","version":"0.3.1"}\n' > .design-sync/pkg/package.json && ln -sfn ../../src/components/ui .design-sync/pkg/ui`
2. Compiled CSS into it: `npx -y @tailwindcss/cli@4.1.5 -i src/app/globals.css -o .design-sync/pkg/ds-compiled.css --minify`
3. Point node_modules at scratch: `ln -sfn ../.design-sync/pkg node_modules/myra-agents`
   (NEVER symlink node_modules/myra-agents -> repo root: self-referential recursion.)
4. Then build: `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle`
Config paths reflect the scratch pkg: srcDir="ui", tsconfig="../../tsconfig.json", cssEntry="ds-compiled.css".

## Re-sync risks (forward-looking)
- `ds-compiled.css` and the scratch pkg + symlink are gitignored — regenerate every re-sync (above).
- Combobox uses Base UI (@base-ui/react); charts pull recharts from node_modules (not the bundle) —
  preview compiles depend on those deps staying installed.
- All 298 authored previews are on the DEFAULT token theme; preset themes not shipped.
- Group is flat "general" (ui/ is a flat dir) — 299 cards in one group. If grouping is wanted later,
  add per-component `cfg.docsMap` category stubs or reorganize src.
