#!/usr/bin/env node
// Targeted preview recompile — the fast inner loop for the compare/grading
// workflow, and the ONLY rebuild parallel subagents may run. Recompiles
// the component's preview .tsx (owned .design-sync/previews/ first, else
// generated .design-sync/.cache/previews/) → <out>/_preview/<Name>.js and re-emits the
// module-variant <Name>.html for just the named components. It does NOT touch
// _ds_bundle.js, styles.css, .d.ts, .prompt.md, or any other component — and
// it never wipes --out — so concurrent invocations over disjoint component
// sets are safe (package-build.mjs rm -rf's the whole bundle and must stay
// orchestrator-only).
//
// Reads resolved build facts (namespace, pkg, extraEntries, groups) from
// <out>/.stories-map.json, written by package-build.mjs, so this script can't
// drift from what the full build resolved. The .tsx ownership marker is NOT
// consulted here — whatever is in the file is compiled verbatim (marker
// handling only matters at generation time, in the full build).
//
// Usage:
//   node lib/preview-rebuild.mjs --config .design-sync/config.json \
//     --node-modules <nm> --out ./ds-bundle --components Button,Tabs

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KEY_RECIPE, configSlicesFor, renderHashFor } from './sync-hashes.mjs';

// Honor repo forks of the lib modules, same as package-build's loadLib — a
// targeted rebuild must compile with identical import rules AND identical
// build options, or full builds and rebuilds produce different
// _preview/<Name>.js bytes (which also churns the compare gradeKey). That
// parity is why emit/bundle also route through here even though forking
// them is unsupported (app-contract surface): if a repo forks one anyway,
// both build paths at least see the same code. sync-hashes stays a static
// import — it is fork-banned outright.
async function loadLib(name) {
  const fork = resolve('.design-sync', 'overrides', `${name}.mjs`);
  if (existsSync(fork)) return import(pathToFileURL(fork).href);
  return import(`./${name}.mjs`);
}

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };

const CONFIG_PATH = flag('config');
let cfg = {};
if (CONFIG_PATH) {
  try { cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { console.error(`[CONFIG] ${CONFIG_PATH}: ${e.message}`); process.exit(1); }
}
const NODE_MODULES = flag('node-modules') && resolve(flag('node-modules'));
const OUT = flag('out') && resolve(flag('out'));
const NAMES = (flag('components') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (!NODE_MODULES || !OUT || !NAMES.length) {
  console.error('required: --node-modules --out --components A,B --config .design-sync/config.json (--config optional only for pre-sourceKey bundles)');
  process.exit(1);
}

// Build facts from the manifest package-build wrote (authoritative over cfg —
// the namespace is normalized and extraEntries include auto-detected icon
// siblings). Fail loudly when absent: a missing manifest means there was no
// prior full build to rebuild against.
const mapPath = join(OUT, '.stories-map.json');
if (!existsSync(mapPath)) {
  console.error(`[NO_MANIFEST] ${mapPath} not found — run package-build.mjs first.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(mapPath, 'utf8'));
const GLOBAL = manifest.global;
const PKG = manifest.pkg ?? cfg.pkg;
const PKG_DIR = manifest.pkgDir;
const extraEntries = manifest.extraEntries ?? cfg.extraEntries ?? [];
const byName = new Map((manifest.components ?? []).map((c) => [c.name, c]));

// Group lookup: manifest first, else find the existing component dir.
function groupOf(name) {
  const m = byName.get(name);
  if (m) return m.group;
  const root = join(OUT, 'components');
  try {
    for (const g of readdirSync(root)) {
      if (existsSync(join(root, g, name, `${name}.html`))) return g;
    }
  } catch { /* fall through */ }
  return null;
}

const targets = [];
for (const n of NAMES) {
  const group = groupOf(n);
  if (!group) { console.error(`! ${n}: not in .stories-map.json and no components/*/${n}/ dir — skipped`); continue; }
  const owned = existsSync(resolve('.design-sync', 'previews', `${n}.tsx`));
  if (!owned && !existsSync(resolve('.design-sync', '.cache', 'previews', `${n}.tsx`))) {
    console.error(`! ${n}: no ${n}.tsx in .design-sync/previews/ (owned) or .design-sync/.cache/previews/ (generated) — skipped`);
    continue;
  }
  // A hand-modified cache twin IS in the grade key (userPreviewFor detects
  // the edited marker), but previews/ remains the durable home — the cache
  // copy is gitignored and vanishes on a fresh clone.
  if (!owned) console.error(`! ${n}: rebuilding from the generated cache twin (.design-sync/.cache/previews/) — a hand-modified twin re-keys at the next full build, but it is gitignored; move it to .design-sync/previews/${n}.tsx to keep it`);
  targets.push({ name: n, group });
}
if (!targets.length) { console.error('[ZERO_MATCH] nothing to rebuild'); process.exit(1); }

// Stamp invariant: this rebuild compiles/emits from LIVE config and forks,
// so the stamped slices must still describe them — else the re-stamped key
// vouches for artifacts this config didn't produce, and a provider/fork/
// override edit would ride the spot-check tier instead of re-grading.
if (manifest.keyRecipe === KEY_RECIPE && manifest.cfgSliceGlobal !== undefined) {
  // The guard compares live config against the stamp, so a source-keyed
  // bundle REQUIRES the real config here — comparing the {} default would
  // report [CONFIG_STALE] for a config that never changed.
  if (!CONFIG_PATH) {
    console.error('✗ this bundle carries stamped grade keys — pass --config .design-sync/config.json (the stamp guard compares live config against the build)');
    process.exit(1);
  }
  const live = configSlicesFor(cfg);
  const stale = live.global !== manifest.cfgSliceGlobal
    ? 'config or .design-sync/overrides/'
    : targets.some((t) => byName.get(t.name)?.cfgSlice !== undefined && live.componentFor(t.name) !== byName.get(t.name).cfgSlice)
      ? 'cfg.overrides/cfg.titleMap for a target component'
      : null;
  if (stale) {
    console.error(`✗ [CONFIG_STALE] ${stale} changed since the stamped build — run package-build.mjs first (the full build re-stamps the grade keys)`);
    process.exit(1);
  }
}

const { storyImportPlugins } = await loadLib('story-imports');
const { buildPreviews } = await loadLib('previews');
const { reactShim, tsconfigPathsPlugin } = await loadLib('bundle');
const { previewHtmlModule, providerWrapper } = await loadLib('emit');
const { gitWorkspaceRoot } = await loadLib('common');

// cfg.tsconfig is package-relative and bounded the way package-build's
// cfgPath bounds it (realpath inside the workspace root, so symlinks can't
// escape) — full builds and targeted rebuilds must compile with identical
// options from identically-vetted config.
let tsconfigPath = cfg.tsconfig && PKG_DIR ? resolve(PKG_DIR, cfg.tsconfig) : null;
if (tsconfigPath) {
  try {
    const r = relative(gitWorkspaceRoot(realpathSync(dirname(NODE_MODULES))), realpathSync(tsconfigPath));
    if (r.startsWith('..') || isAbsolute(r)) {
      console.error(`  ! tsconfig: ${cfg.tsconfig} resolves outside the workspace root — skipped`);
      tsconfigPath = null;
    }
  } catch { tsconfigPath = null; } // missing/unreadable — same as absent
}
const pathsPlugin = tsconfigPath ? tsconfigPathsPlugin(tsconfigPath) : null;
const storyImports = storyImportPlugins({
  PKG, GLOBAL, extraEntries,
  exported: new Set(manifest.exported ?? []),
  cfg,
  pkgDir: PKG_DIR,
});
const built = await buildPreviews({
  components: targets,
  previewDir: resolve('.design-sync', 'previews'),
  genDir: resolve('.design-sync', '.cache', 'previews'),
  OUT, reactShim, NODE_MODULES, pathsPlugin,
  importPlugins: storyImports.plugins,
  loaders: storyImports.loaders,
});

// Re-emit the module-variant html for each successfully compiled preview.
// Needed when the component previously fell back to the floor-card html
// (its .tsx didn't compile then) — that html doesn't load _preview/<Name>.js.
// Provider wrap mirrors emitPerComponent exactly: cfg.provider is trusted
// as-is — package-build's fatal/[PROVIDER_UNVERIFIED] gate already ran (a
// manifest only exists from a build that passed it), and re-gating here on
// manifest.exported diverged from the full build (nonComponents pruning
// removes context heads like `ThemeContext` from that set, silently
// stripping the wrap from targeted rebuilds only).
const hasDecorators = existsSync(join(OUT, '_vendor', 'preview-decorators.js'));
const wrap = providerWrapper(cfg.provider ?? null, GLOBAL, hasDecorators);
const decoratorScript = hasDecorators ? '\n  <script src="../../../_vendor/preview-decorators.js"></script>' : '';
const bundleCssLink = existsSync(join(OUT, '_ds_bundle.css'))
  ? '\n  <link rel="stylesheet" href="../../../_ds_bundle.css">' : '';
let failed = 0;
// Card options mirror emit.mjs's derivation exactly (single-mode cards declare
// the grading viewport).
const OVERRIDES = cfg.overrides ?? {};
for (const t of targets) {
  if (!built.has(t.name)) { failed++; continue; } // buildPreviews already printed the esbuild error
  const previewCssLink = existsSync(join(OUT, '_preview', `${t.name}.css`))
    ? `\n  <link rel="stylesheet" href="../../../_preview/${t.name}.css">` : '';
  const ov = OVERRIDES[t.name] ?? {};
  const card = ov.cardMode === 'single'
    ? { cardMode: 'single', primaryStory: ov.primaryStory, viewport: ov.viewport ?? '900x700' }
    : ov.viewport ? { viewport: ov.viewport } : {};
  const html = previewHtmlModule(t.group, t.name, GLOBAL, wrap, decoratorScript, bundleCssLink, previewCssLink, card);
  const dir = join(OUT, 'components', t.group, t.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${t.name}.html`), html);
}
// Patch the sidecar and manifest entries this rebuild invalidated — both
// must keep describing what's on disk (the owned-.tsx bytes move the key;
// the config slices come from the stamp, guarded above). Only renderHashes/
// sourceKeys move. CONCURRENCY: plain read-modify-writes over BOTH files —
// concurrent scoped rebuilds can lose a patch. Tolerated, not solved:
// package-validate hard-fails on render-hash mismatch; a lost key-REMOVAL
// resurrects the stale stamped key, which on a fully-graded target surfaces
// as compare refusing the fresh sheet, but on a partially-graded one can
// silently keep verdicts judged against the pre-edit preview until the
// final full build rewrites both files wholesale.
// The sidecar is best-effort; the manifest key-removal must not die with
// it — the sidecar only contributes `shape`, derivable from the manifest.
const sidecarPath = join(OUT, '_ds_sync.json');
let sidecar = null;
try { sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8')); }
catch (e) { console.error(`! _ds_sync.json not readable (${String(e.message ?? e).split('\n')[0]}) — sidecar not patched; run a full package-build before validate/upload`); }
// Shape guard (remote-diff's validSidecar class): a parseable sidecar
// without a renderHashes object would TypeError mid-patch.
if (sidecar && (!sidecar.renderHashes || typeof sidecar.renderHashes !== 'object' || Array.isArray(sidecar.renderHashes))) {
  console.error('! _ds_sync.json malformed (renderHashes) — sidecar not patched; run a full package-build before validate/upload');
  sidecar = null;
}
const sbShape = sidecar ? sidecar.shape === 'storybook' : !!manifest.storybookStatic;

// MANIFEST first — the grade-safety half. The stamped sourceKey is REMOVED
// for a rebuilt target, never recomputed here: this rebuild compiles inputs
// the stamp can't verify (story modules and import closures may have moved
// since the build — the manifest's srcSha is stale by construction), so a
// recomputed key would vouch for sources it never saw. With no key, the
// target drops to the old render-contract keying (the compiled bytes this
// rebuild just changed) until the next full build re-stamps it; capture
// jsons minted in that window carry no keyRecipe claim, so the adoption
// shim re-adopts them at the closing full build. The manifest is RE-READ
// here and patched per-target: concurrent fan-out rebuilds (§4c) would
// otherwise resurrect a parallel finisher's removals by rewriting the file
// from this process's startup snapshot. (A millisecond read-to-write window
// remains; the full build rewrites both files wholesale.)
try {
  const live = JSON.parse(readFileSync(mapPath, 'utf8'));
  const liveBy = new Map((live.components ?? []).map((c) => [c.name, c]));
  for (const t of targets) {
    if (!built.has(t.name)) continue;
    delete liveBy.get(t.name)?.sourceKey;
    delete byName.get(t.name)?.sourceKey;
  }
  writeFileSync(mapPath, JSON.stringify(live, null, 2) + '\n');
} catch (e) {
  console.error(`! .stories-map.json not updated (${String(e.message ?? e).split('\n')[0]}) — rebuilt target(s) keep a STALE stamped grade key; run a full package-build before trusting compare results`);
}

// Sidecar second — upload bookkeeping, best-effort.
if (sidecar) {
  try {
    for (const t of targets) {
      if (!built.has(t.name)) continue;
      const c = byName.get(t.name);
      if (!c) { console.error(`! ${t.name}: not in the manifest — sidecar entry not patched; run a full package-build before validate/upload`); continue; }
      sidecar.renderHashes[t.name] = renderHashFor(OUT, { name: t.name, group: t.group },
        sbShape
          ? { stories: (c.stories ?? []).map((st) => ({ name: st.name, exportKey: st.exportKey ?? null, emitted: st.emitted ?? null })), srcSha: c.srcSha ?? null }
          : {});
      if (sidecar.sourceKeys) delete sidecar.sourceKeys[t.name];
    }
    writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');
  } catch (e) { console.error(`! _ds_sync.json not updated (${String(e.message ?? e).split('\n')[0]}) — run a full package-build before validate/upload`); }
}

console.error(`✓ rebuilt ${built.size}/${targets.length} preview(s)${failed ? ` — ${failed} failed to compile (fix the .tsx and re-run)` : ''}`);
process.exit(failed ? 1 : 0);
