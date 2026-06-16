// logs.test.ts — component tests for the Logs & History screen.
//
// Read-only: navigates to Logs and asserts the screen heading renders. The
// individual entries are data-dependent, so we assert the screen, not specific
// rows (add a row assertion against a known seeded run if your fixtures pin one).

import { test, describe } from "bun:test";
import { app, assertFlowOk } from "@ax";
import { APP } from "../app.config";

describe("Logs", () => {
  test("navigates to Logs & History", async () => {
    const r = await app(APP.windowTitle)
      .click("AXLink", "Logs")
      .waitFor("AXHeading", "Logs & History")
      .run();
    assertFlowOk(r);
  });
});
