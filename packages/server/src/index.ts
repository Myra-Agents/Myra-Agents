import type { Capability } from "@myra/shared";

import { createApp } from "./app";
import { startConnector } from "./connector";
import { resolveDataDir } from "./store/file-store";
import { selectStore } from "./store/select-store";
import { hostname } from "node:os";

const port = Number(process.env.PORT ?? 4319);
const store = await selectStore();
const { app, websocket, bus, runner } = createApp({ store });

console.log(`[myra-server] listening on http://127.0.0.1:${port} (data: ${resolveDataDir()})`);

// Optional: dial out to a centralized hub so this instance shows up on a remote
// dashboard. Absent `MYRA_HUB_URL`, the server behaves exactly as before.
const hubUrl = process.env.MYRA_HUB_URL?.trim();
if (hubUrl) {
  startConnector({
    hubUrl,
    userId: process.env.MYRA_HUB_USER?.trim() || "dev",
    instanceId: process.env.MYRA_INSTANCE_ID?.trim() || hostname(),
    label: process.env.MYRA_INSTANCE_LABEL?.trim() || hostname(),
    capabilities: ["agent", "os"] as Capability[],
    store,
    runner,
    bus,
  });
}

export default {
  port,
  fetch: app.fetch,
  websocket,
};
