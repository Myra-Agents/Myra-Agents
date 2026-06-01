import { enroll } from "./enroll";
import { hostname } from "node:os";

/**
 * `bun run enroll <code>` — pair this machine to a hub.
 *
 * Env: MYRA_HUB_URL (required, http(s) base), MYRA_INSTANCE_ID + MYRA_INSTANCE_LABEL
 * (optional, default to the hostname). Writes the credential to the data dir;
 * the server then connects automatically on boot.
 */
const [cmd, code] = process.argv.slice(2);

if (cmd !== "enroll" || !code) {
  console.error("usage: bun run enroll <pairing-code>");
  process.exit(1);
}

const hubUrl = process.env.MYRA_HUB_URL?.trim();
if (!hubUrl) {
  console.error("MYRA_HUB_URL is required (e.g. http://127.0.0.1:4400)");
  process.exit(1);
}

const instanceId = process.env.MYRA_INSTANCE_ID?.trim() || hostname();
const label = process.env.MYRA_INSTANCE_LABEL?.trim() || hostname();

try {
  const cred = await enroll({ hubUrl, code, instanceId, label });
  console.log(`[enroll] paired "${cred.instanceId}" to ${cred.hubUrl} as user "${cred.userId}"`);
} catch (err) {
  console.error(`[enroll] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
