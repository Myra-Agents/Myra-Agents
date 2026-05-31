import { type HubCredential, saveCredential } from "./credential";

/**
 * Exchange a one-time pairing code (minted by the dashboard) for a long-lived
 * instance credential, and persist it. Run once per machine via the CLI:
 * `bun run enroll <code>`. After this the server auto-connects on boot.
 */
export async function enroll(opts: {
  hubUrl: string;
  code: string;
  instanceId: string;
  label: string;
}): Promise<HubCredential> {
  const base = opts.hubUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: opts.code, instanceId: opts.instanceId, label: opts.label }),
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    data?: { token: string; userId: string };
    error?: string;
  } | null;
  if (!body?.ok || !body.data) {
    throw new Error(body?.error ?? `enrollment failed (${res.status})`);
  }
  const cred: HubCredential = {
    hubUrl: base,
    token: body.data.token,
    userId: body.data.userId,
    instanceId: opts.instanceId,
    label: opts.label,
  };
  saveCredential(cred);
  return cred;
}
