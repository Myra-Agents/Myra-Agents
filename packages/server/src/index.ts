import { createApp } from "./app";
import { resolveDataDir } from "./store/file-store";

const port = Number(process.env.PORT ?? 4319);
const { app, websocket } = createApp();

console.log(`[myra-server] listening on http://127.0.0.1:${port} (data: ${resolveDataDir()})`);

export default {
  port,
  fetch: app.fetch,
  websocket,
};
