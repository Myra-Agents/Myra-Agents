#!/usr/bin/env node
// Push App Store product-page metadata via the App Store Connect API.
//
// Updates the editable App Store version's localizations (description,
// keywords, promotional text, support/marketing URL, what's-new) and the
// app-level info localizations (name, subtitle, privacy policy URL), per
// platform and locale, from a JSON file. Idempotent: patches existing
// localizations, creates missing ones.
//
// What this does NOT do (Apple limits / separate tooling):
//   - create the app record               (UI-only; apps resource is GET/UPDATE)
//   - upload screenshots / app previews    (multi-step reserve+upload+commit;
//                                            use fastlane deliver for those)
//   - upload the binary build              (Transporter / xcrun altool)
//   - submit for review                    (reviewSubmissions; add later)
//
// Auth: same App Store Connect API key env as asc-client.mjs
//   (ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_PATH | ASC_KEY_P8).
//
// Usage:
//   node scripts/asc-update-metadata.mjs [--file scripts/asc-metadata.json] [--dry-run]
import { readFileSync } from "node:fs";
import { api, die, errStr } from "./asc-client.mjs";

const arg = (name, fb) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && (process.argv[i + 1] ?? "").slice(0, 2) !== "--" ? process.argv[i + 1] : fb;
};
const DRY = process.argv.includes("--dry-run");
const FILE = arg("file", "scripts/asc-metadata.json");

let cfg;
try {
  cfg = JSON.parse(readFileSync(FILE, "utf8"));
} catch (e) {
  die(`cannot read ${FILE}: ${e.message} (copy scripts/asc-metadata.example.json)`);
}
const bundleId = cfg.bundleId || die("config needs a bundleId");
const platforms = cfg.platforms?.length ? cfg.platforms : ["IOS"];

// Editable App Store states (anything not yet locked by review/release).
const EDITABLE = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
  "WAITING_FOR_REVIEW",
]);

// PATCH the given resource if it exists, else POST to create. Generic over the
// localization resource types so version + appInfo flows share one path.
async function upsertLocalization(type, listPath, parentRel, parentId, locale, attributes) {
  if (!attributes || Object.keys(attributes).length === 0) return;
  const list = await api("GET", `${listPath}?limit=200`);
  if (list.status >= 400) die(`list ${type} failed (${errStr(list)})`);
  const found = (list.json.data || []).find((l) => l.attributes?.locale === locale);

  if (DRY) {
    console.log(`    [dry-run] ${found ? "PATCH" : "POST"} ${type} (${locale}): ${Object.keys(attributes).join(", ")}`);
    return;
  }
  if (found) {
    const r = await api("PATCH", `/v1/${type}/${found.id}`, {
      data: { type, id: found.id, attributes },
    });
    if (r.status >= 400) die(`patch ${type} (${locale}) failed (${errStr(r)})`);
    console.log(`    ~ updated ${type} (${locale})`);
  } else {
    const r = await api("POST", `/v1/${type}`, {
      data: {
        type,
        attributes: { locale, ...attributes },
        relationships: { [parentRel]: { data: { type: parentRelType(parentRel), id: parentId } } },
      },
    });
    if (r.status >= 400) die(`create ${type} (${locale}) failed (${errStr(r)})`);
    console.log(`    + created ${type} (${locale})`);
  }
}
const parentRelType = (rel) => (rel === "appStoreVersion" ? "appStoreVersions" : "appInfo");

// ---- resolve the app -------------------------------------------------------
const appRes = await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`);
if (appRes.status >= 400) die(`lookup app failed (${errStr(appRes)})`);
const app = (appRes.json.data || [])[0];
if (!app) die(`no app record for bundleId ${bundleId} — create it in App Store Connect first (Apps -> New App).`);
console.log(`App: ${app.attributes?.name} (id ${app.id})  bundleId ${bundleId}`);

// ---- app-level info localizations (name / subtitle / privacy URL) ----------
if (cfg.info) {
  // The editable appInfo is the one not yet in a terminal state. Grab the first.
  const infos = await api("GET", `/v1/apps/${app.id}/appInfos?limit=10`);
  if (infos.status >= 400) die(`list appInfos failed (${errStr(infos)})`);
  const appInfo = (infos.json.data || [])[0];
  if (appInfo) {
    console.log("  app info localizations:");
    for (const [locale, attrs] of Object.entries(cfg.info)) {
      await upsertLocalization(
        "appInfoLocalizations",
        `/v1/appInfos/${appInfo.id}/appInfoLocalizations`,
        "appInfo",
        appInfo.id,
        locale,
        attrs,
      );
    }
  }
}

// ---- per-platform version localizations ------------------------------------
for (const platform of platforms) {
  const vers = await api(
    "GET",
    `/v1/apps/${app.id}/appStoreVersions?filter[platform]=${platform}&limit=10`,
  );
  if (vers.status >= 400) die(`list versions (${platform}) failed (${errStr(vers)})`);
  const editable = (vers.json.data || []).find((v) => EDITABLE.has(v.attributes?.appStoreState));
  if (!editable) {
    console.warn(`  ! ${platform}: no editable version (states: ${(vers.json.data || []).map((v) => v.attributes?.appStoreState).join(", ") || "none"}) — skipping`);
    continue;
  }
  console.log(`  ${platform} version ${editable.attributes?.versionString} (${editable.attributes?.appStoreState}):`);
  for (const [locale, attrs] of Object.entries(cfg.version || {})) {
    await upsertLocalization(
      "appStoreVersionLocalizations",
      `/v1/appStoreVersions/${editable.id}/appStoreVersionLocalizations`,
      "appStoreVersion",
      editable.id,
      locale,
      attrs,
    );
  }
}

console.log(DRY ? "\nDry run complete — no changes sent." : "\nDone.");
