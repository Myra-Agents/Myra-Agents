import { resolveDataDir } from "../store/file-store";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The hub credential this instance obtained at enrollment. Stored next to the
 * board so it follows the data dir (real / demo). `hubUrl` is the http(s) base;
 * the connector derives the ws(s) URL from it.
 */
export interface HubCredential {
  hubUrl: string;
  token: string;
  userId: string;
  instanceId: string;
  label: string;
}

function credentialFile(): string {
  return join(resolveDataDir(), "hub-credential.json");
}

export function loadCredential(): HubCredential | null {
  try {
    return JSON.parse(readFileSync(credentialFile(), "utf8")) as HubCredential;
  } catch {
    return null;
  }
}

export function saveCredential(cred: HubCredential): void {
  const file = credentialFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cred, null, 2));
}

/** Drop the enrollment so the server stops dialing the hub. Idempotent. */
export function deleteCredential(): boolean {
  try {
    rmSync(credentialFile());
    return true;
  } catch {
    return false;
  }
}
