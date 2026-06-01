import { createHubApp } from "./app";

const port = Number(process.env.HUB_PORT ?? 4400);
const { app, websocket } = createHubApp();

console.log(`[myra-hub] listening on http://127.0.0.1:${port}`);

export default {
  port,
  fetch: app.fetch,
  websocket,
};
