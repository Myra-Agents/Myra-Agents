import type { Capability } from "@myra/shared";

import { createApp } from "./app";
import { startConnector } from "./connector";
import { loadCredential } from "./connector/credential";
import { resolveDataDir } from "./store/file-store";
import { selectStore } from "./store/select-store";

const port = Number(process.env.PORT ?? 4319);
const store = await selectStore();
const { app, websocket, bus, runner } = createApp({ store });

console.log(`[myra-server] listening on http://127.0.0.1:${port} (data: ${resolveDataDir()})`);

// If this machine has been enrolled to a hub, dial out so it shows up on a
// remote dashboard. Not enrolled → the server just serves its own HTTP port.
const credential = loadCredential();
if (credential) {
  startConnector({
    hubUrl: credential.hubUrl,
    token: credential.token,
    instanceId: credential.instanceId,
    label: credential.label,
    capabilities: ["agent", "os"] as Capability[],
    store,
    runner,
    bus,
  });
} else if (process.env.MYRA_HUB_URL) {
  console.log("[myra-server] MYRA_HUB_URL set but not enrolled — run: bun run enroll <pairing-code>");
}

export default {
  port,
  fetch: app.fetch,
  websocket,
};
