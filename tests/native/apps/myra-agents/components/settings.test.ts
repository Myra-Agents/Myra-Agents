// settings.test.ts — component tests for the Settings screen.
//
// Read-only: asserts the tab set and the Preferences pane, and exercises tab
// switching. We deliberately do NOT change the Theme/Language combos — those
// persist across launches.

import { test, expect, describe } from "bun:test";
import { app, assertFlowOk } from "@ax";
import { APP } from "../app.config";

const TABS = ["Preferences", "Agents", "Local models", "Data"];

describe("Settings", () => {
  test("shows all preference tabs", async () => {
    let flow = app(APP.windowTitle)
      .click("AXLink", "Settings")
      .waitFor("AXHeading", "Settings");
    for (const tab of TABS) flow = flow.assertExists({ role: "AXRadioButton", name: tab });
    assertFlowOk(await flow.run());
  });

  test("Preferences pane lists Language, Default Page and Theme", async () => {
    const r = await app(APP.windowTitle)
      .click("AXLink", "Settings")
      .waitFor("AXHeading", "Settings")
      .click("AXRadioButton", "Preferences")
      .assertExists({ role: "AXStaticText", name: "Language" })
      .assertExists({ role: "AXStaticText", name: "Default Page" })
      .assertExists({ role: "AXStaticText", name: "Theme" })
      .run();
    assertFlowOk(r);
  });

  test("switching to the Agents tab selects it", async () => {
    const r = await app(APP.windowTitle)
      .click("AXLink", "Settings")
      .waitFor("AXHeading", "Settings")
      .click("AXRadioButton", "Agents")
      .read({ role: "AXRadioButton", name: "Agents" }, "agentsSelected")
      .click("AXRadioButton", "Preferences") // restore default tab
      .run();
    assertFlowOk(r);
    expect(r.reads.agentsSelected).toBe("true");
  });
});
