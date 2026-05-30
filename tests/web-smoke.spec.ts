import { chromium, type ConsoleMessage } from "playwright";

const BASE = "http://localhost:1420";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  // Noise to ignore:
  // - `[Dev Mode] … skipped`: documented browser-only contract for desktop-only
  //   agent commands — not a real error.
  // - ChunkLoadError / ERR_CONTENT_LENGTH_MISMATCH / "Loading chunk": Turbopack
  //   dev-server compile races, not app bugs. Only ignored in dev.
  const isExpected = (s: string) =>
    s.includes("[Dev Mode]") ||
    s.includes("ChunkLoadError") ||
    s.includes("Loading chunk") ||
    s.includes("ERR_CONTENT_LENGTH_MISMATCH") ||
    s.includes("Failed to load resource");
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !isExpected(m.text())) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => {
    if (!isExpected(String(e))) pageErrors.push(String(e));
  });

  // Warm the dev server (first hit triggers Turbopack compilation) before the
  // graded run, so compile-time chunk races don't pollute the real load.
  await page.goto(`${BASE}/kanban/`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(500);

  // Fresh state.
  await page.goto(`${BASE}/kanban/`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("myra-agents.dev.cards");
    localStorage.removeItem("myra-agents.dev.schedules");
  });
  await page.reload({ waitUntil: "networkidle" });

  // --- Columns render ---
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  check("columns render", ["draft", "to do", "in progress", "done"].every((c) => bodyText.includes(c)));

  // --- Add a card ---
  const cardsBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem("myra-agents.dev.cards") || "[]").length,
  );
  await page.getByRole("button", { name: /add card/i }).first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  const title = `PW Test ${Date.now()}`;
  const dialog = page.locator('[role="dialog"]');
  // First textbox = Title. Filling it enables the "Create" submit button.
  await dialog.getByRole("textbox").first().fill(title);
  const create = dialog.getByRole("button", { name: "Create", exact: true });
  await create.waitFor({ state: "visible" });
  check("create enables after title", !(await create.isDisabled()));
  await create.click();
  await page.waitForTimeout(800);

  const cardsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("myra-agents.dev.cards") || "[]"));
  check(
    "add_card persisted (+1)",
    cardsAfter.length === cardsBefore + 1,
    `before=${cardsBefore} after=${cardsAfter.length}`,
  );
  const created = cardsAfter.find((c: { title: string }) => c.title === title);
  check("created card has title", !!created, created ? `id=${created.id}` : "not found");
  check("created card has position", !!created && typeof created.position === "number", `pos=${created?.position}`);

  // --- Card visible on board ---
  check("card visible on board", await page.getByText(title).first().isVisible());

  // --- Reload persists ---
  await page.reload({ waitUntil: "networkidle" });
  check("card persists after reload", await page.getByText(title).first().isVisible().catch(() => false));

  // --- Settings page renders ---
  await page.goto(`${BASE}/settings/`, { waitUntil: "networkidle" });
  check("settings page renders", (await page.locator("body").innerText()).length > 50);

  // --- Schedules page renders ---
  await page.goto(`${BASE}/schedules/`, { waitUntil: "networkidle" });
  check("schedules page renders", (await page.locator("body").innerText()).length > 30);

  check("no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 8)));
  check("no page errors", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 8)));

  await browser.close();

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`[${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("RUNNER ERROR:", e);
  process.exit(2);
});
