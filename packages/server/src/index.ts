import { createApp } from "./app";
import { resolveDataDir } from "./store/file-store";
import { selectStore } from "./store/select-store";

const port = Number(process.env.PORT ?? 4319);
const store = await selectStore();
const { app, websocket } = createApp({ store });

console.log(`[myra-server] listening on http://127.0.0.1:${port} (data: ${resolveDataDir()})`);

export default {
  port,
  fetch: app.fetch,
  websocket,
};
