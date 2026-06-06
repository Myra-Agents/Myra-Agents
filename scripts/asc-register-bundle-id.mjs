#!/usr/bin/env node
// Register the App ID (Bundle ID) for Myra Agents via the App Store Connect API.
//
// NOTE: the App Store Connect *app record* (the "New App" button) CANNOT be
// created via the API — Apple's `apps` resource is GET/UPDATE only. This script
// only registers the Bundle ID + optional capabilities, which the API does
// support (POST /v1/bundleIds, POST /v1/bundleIdCapabilities). Create the app
// record by hand in App Store Connect afterwards.
//
// Auth: an App Store Connect API key (Users and Access -> Integrations ->
// App Store Connect API). Provide via env:
//   ASC_ISSUER_ID   issuer UUID shown on the Integrations page
//   ASC_KEY_ID      the key's Key ID
//   ASC_KEY_PATH    path to the downloaded AuthKey_<KEYID>.p8   (or:)
//   ASC_KEY_P8      the .p8 contents inline (PEM)
//
// Usage:
//   node scripts/asc-register-bundle-id.mjs \
//        [--identifier com.myra-agents.app] [--name "Myra Agents"] \
//        [--platform UNIVERSAL] [--capabilities ASSOCIATED_DOMAINS,PUSH_NOTIFICATIONS]
//
// Defaults: identifier com.myra-agents.app, name "Myra Agents", platform
// UNIVERSAL (covers iOS + macOS), no capabilities.
import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { readFileSync } from "node:fs";

const HOST = "https://api.appstoreconnect.apple.com";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ---- credentials -----------------------------------------------------------
const ISSUER = process.env.ASC_ISSUER_ID || die("set ASC_ISSUER_ID");
const KEY_ID = process.env.ASC_KEY_ID || die("set ASC_KEY_ID");
const P8 =
  process.env.ASC_KEY_P8 ||
  (process.env.ASC_KEY_PATH
    ? readFileSync(process.env.ASC_KEY_PATH, "utf8")
    : die("set ASC_KEY_PATH or ASC_KEY_P8"));

// ---- ES256 JWT (valid <=20 min) --------------------------------------------
function makeJwt() {
  const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(P8);
  // dsaEncoding ieee-p1363 yields the raw r||s signature JOSE/ES256 expects.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64url(signature)}`;
}

async function api(method, path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${makeJwt()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

// ---- main ------------------------------------------------------------------
const identifier = arg("identifier", "com.myra-agents.app");
const name = arg("name", "Myra Agents").replace(/[^A-Za-z0-9 ]/g, ""); // ASC rejects punctuation
const platform = arg("platform", "UNIVERSAL"); // IOS | MAC_OS | UNIVERSAL
const capabilities = (arg("capabilities", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Registering bundle ID:
  identifier:   ${identifier}
  name:         ${name}
  platform:     ${platform}
  capabilities: ${capabilities.length ? capabilities.join(", ") : "(none)"}`);

// Already registered? Find it instead of failing.
let bundleId;
const existing = await api(
  "GET",
  `/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}&limit=200`,
);
if (existing.status >= 400) die(`auth/list failed (HTTP ${existing.status}): ${JSON.stringify(existing.json)}`);
bundleId = (existing.json.data || []).find((b) => b.attributes?.identifier === identifier);

if (bundleId) {
  console.log(`✓ already registered (id ${bundleId.id}) — reusing.`);
} else {
  const created = await api("POST", "/v1/bundleIds", {
    data: { type: "bundleIds", attributes: { identifier, name, platform, seedId: undefined } },
  });
  if (created.status !== 201) die(`create failed (HTTP ${created.status}): ${JSON.stringify(created.json)}`);
  bundleId = created.json.data;
  console.log(`✓ created bundle ID (id ${bundleId.id}).`);
}

// Optional capabilities (e.g. ASSOCIATED_DOMAINS for iOS universal links).
for (const cap of capabilities) {
  const r = await api("POST", "/v1/bundleIdCapabilities", {
    data: { type: "bundleIdCapabilities", attributes: { capabilityType: cap }, relationships: { bundleId: { data: { type: "bundleIds", id: bundleId.id } } } },
  });
  if (r.status === 201) console.log(`  + enabled ${cap}`);
  else if (r.status === 409) console.log(`  = ${cap} already enabled`);
  else console.warn(`  ! ${cap} failed (HTTP ${r.status}): ${JSON.stringify(r.json)}`);
}

console.log(`
Done. Bundle ID ${identifier} is registered (id ${bundleId.id}).
Next (UI-only — not scriptable): App Store Connect -> Apps -> New App, pick
this bundle ID, check iOS + macOS. The app record cannot be created via API.`);
