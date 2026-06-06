// Minimal, zero-dependency App Store Connect API client.
// ES256 JWT signed with Node's built-in crypto (no jsonwebtoken needed).
//
// Credentials come from the environment (an App Store Connect API key —
// App Store Connect -> Users and Access -> Integrations):
//   ASC_ISSUER_ID   issuer UUID
//   ASC_KEY_ID      key ID
//   ASC_KEY_PATH    path to AuthKey_<KEYID>.p8   (or ASC_KEY_P8 inline PEM)
import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { readFileSync } from "node:fs";

export const HOST = "https://api.appstoreconnect.apple.com";

export function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function credentials() {
  const issuer = process.env.ASC_ISSUER_ID || die("set ASC_ISSUER_ID");
  const keyId = process.env.ASC_KEY_ID || die("set ASC_KEY_ID");
  const p8 =
    process.env.ASC_KEY_P8 ||
    (process.env.ASC_KEY_PATH
      ? readFileSync(process.env.ASC_KEY_PATH, "utf8")
      : die("set ASC_KEY_PATH or ASC_KEY_P8"));
  return { issuer, keyId, p8 };
}

// Build a short-lived (<=20 min) ES256 token. Regenerated per request so a
// long-running script never hits expiry.
function makeJwt() {
  const { issuer, keyId, p8 } = credentials();
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuer, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // dsaEncoding ieee-p1363 yields the raw r||s signature JOSE/ES256 requires.
  const sig = cryptoSign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(p8),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(sig)}`;
}

// One request. Returns { status, json }. Never throws on HTTP errors — callers
// inspect status so they can treat 409 (already exists) as success, etc.
export async function api(method, path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: { Authorization: `Bearer ${makeJwt()}`, "Content-Type": "application/json" },
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

export const errStr = (r) => `HTTP ${r.status}: ${JSON.stringify(r.json)}`;
