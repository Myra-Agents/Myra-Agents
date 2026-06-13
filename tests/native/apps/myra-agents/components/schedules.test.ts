// schedules.test.ts — component tests for the Schedules screen + New Schedule modal.
//
// Non-destructive by default: the modal flow fills the form, asserts the state,
// then presses Cancel so nothing is persisted. The persist test is opt-in
// (DESTRUCTIVE=1) because it writes a real schedule + arms a cron.

import { test, expect, describe } from "bun:test";
import { app, assertFlowOk } from "@ax";
import { APP } from "../app.config";

describe("Schedules", () => {
  test("sidebar navigates to the Schedules screen", async () => {
    const r = await app(APP.windowTitle)
      .click("AXLink", "Schedules")
      .waitFor("AXHeading", "Schedules")
      .assertExists({ role: "AXButton", name: "New Schedule" })
      .run();
    assertFlowOk(r);
  });

  test("New Schedule modal opens, accepts input, and reflects it back", async () => {
    const name = "AX Test Schedule";
    const task = "AX test task";
    const desc = "Filled by tauri-ax-test (non-destructive)";

    const r = await app(APP.windowTitle)
      .click("AXLink", "Schedules")
      .waitFor("AXHeading", "Schedules")
      .click("AXButton", "New Schedule")
      .waitFor("AXHeading", "New Schedule")
      // fill the three text inputs by their label (layout-shift resistant)
      .fillByLabel("Schedule Name", "AXTextField", name)
      .fillByLabel("Task title", "AXTextField", task)
      .fillByLabel("Description", "AXTextArea", desc)
      // read the live values back — no blind typing
      .readByLabel("Schedule Name", "AXTextField", "name")
      .readByLabel("Task title", "AXTextField", "task")
      .readByLabel("Description", "AXTextArea", "desc")
      .assertExists({ role: "AXButton", name: "Create" })
      // cleanup: do NOT persist
      .click("AXButton", "Cancel")
      .run();

    assertFlowOk(r);
    expect(r.reads.name).toBe(name);
    expect(r.reads.task).toBe(task);
    expect(r.reads.desc).toBe(desc);
  });

  // Opt-in: actually persists a schedule. Run with: DESTRUCTIVE=1 bun test
  test.if(!!process.env.DESTRUCTIVE)("New Schedule persists on Create", async () => {
    const name = "AX Persisted Schedule";
    const r = await app(APP.windowTitle)
      .click("AXLink", "Schedules")
      .waitFor("AXHeading", "Schedules")
      .click("AXButton", "New Schedule")
      .waitFor("AXHeading", "New Schedule")
      .fillByLabel("Schedule Name", "AXTextField", name)
      .fillByLabel("Task title", "AXTextField", "persisted task")
      .click("AXButton", "Create")
      // modal closes on success; the new row's name appears on the list
      .assertExists({ role: "AXHeading", name: "New Schedule" }, /* not */ true)
      .assertExists({ role: "AXStaticText", valuePrefix: name })
      .run();
    assertFlowOk(r);
  });
});
