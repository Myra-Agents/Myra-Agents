// kanban.test.ts — component tests for the Kanban board.
//
// Read-only: navigates to the board and asserts its structure (the five
// columns, the filter controls, the task counter). Nothing is mutated.

import { test, describe } from "bun:test";
import { app, assertFlowOk } from "@ax";
import { APP } from "../app.config";

const COLUMNS = ["TO DO", "IN PROGRESS", "WAITING FOR FEEDBACK", "AWAITING REVIEW", "DONE"];

describe("Kanban", () => {
  test("renders the five workflow columns", async () => {
    let flow = app(APP.windowTitle)
      .click("AXLink", "Kanban")
      .waitFor("AXHeading", "TO DO");
    for (const col of COLUMNS) flow = flow.assertExists({ role: "AXHeading", name: col });
    assertFlowOk(await flow.run());
  });

  test("exposes the filter toolbar and task counter", async () => {
    const r = await app(APP.windowTitle)
      .click("AXLink", "Kanban")
      .waitFor("AXHeading", "TO DO")
      .assertExists({ role: "AXComboBox", valuePrefix: "All columns" })
      .assertExists({ role: "AXComboBox", valuePrefix: "All agents" })
      .assertExists({ role: "AXComboBox", valuePrefix: "Any time" })
      .assertExists({ role: "AXPopUpButton", name: "Columns" })
      .assertExists({ role: "AXButton", name: "Clear" })
      .assertExists({ role: "AXStaticText", valuePrefix: "Showing" })
      .run();
    assertFlowOk(r);
  });
});
