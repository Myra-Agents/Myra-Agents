// ax.ts — typed flow builder over the JXA AX driver (ax-driver.js).
//
// A Flow accumulates AX steps, then runs them in ONE `osascript` invocation
// (modals re-render between separate runs, so a scenario must be a single pass).
// The driver returns a JSON transcript; `run()` parses it and `expect*`/`reads`
// let the test assert on the result.
//
// Runtime deps: macOS + `osascript` (built in) + Bun. No MCP needed to *run*
// tests — the macos_automator MCP is only for interactive AX exploration while
// *authoring* them (see SKILL.md).

import { join } from "node:path";

const DRIVER = join(import.meta.dir, "ax-driver.js");

export type Step = Record<string, unknown> & { op: string };

export interface StepResult { op: string; ok: boolean; error?: string; value?: unknown; }
export interface FlowResult {
  ok: boolean;
  window: string | null;
  reads: Record<string, string | null>;
  steps: StepResult[];
}

/** Common element selector fields shared by most ops. */
export interface Selector {
  role: string;
  name?: string;
  desc?: string;
  valuePrefix?: string;
  /** index among position-deduped matches (virtualized lists render twice) */
  nth?: number;
  /** seconds to wait after the action settles */
  settle?: number;
}

export class Flow {
  private steps: Step[] = [];
  private opts: Record<string, unknown>;

  constructor(windowTitle: string, opts: { continueOnError?: boolean } = {}) {
    this.opts = opts;
    this.steps.push({ op: "resolveWindow", title: windowTitle });
  }

  /** AXPress an element matched by role + name/desc/valuePrefix. */
  click(role: string, name?: string, extra: Partial<Selector> = {}): this {
    this.steps.push({ op: "click", role, name, ...extra });
    return this;
  }
  /** Focus + keystroke into the field whose label static-text starts with `label`. */
  fillByLabel(label: string, role: string, text: string, extra: Partial<Selector> = {}): this {
    this.steps.push({ op: "fill", label, role, text, ...extra });
    return this;
  }
  /** Focus + keystroke into a field matched directly by selector. */
  fill(sel: Selector, text: string): this {
    this.steps.push({ op: "fill", text, ...sel });
    return this;
  }
  /** Read a field-after-label value into reads[as]. */
  readByLabel(label: string, role: string, as: string): this {
    this.steps.push({ op: "read", label, role, as });
    return this;
  }
  /** Read a selector-matched value into reads[as]. */
  read(sel: Selector, as: string): this {
    this.steps.push({ op: "read", as, ...sel });
    return this;
  }
  /** Poll until an element exists (default 3s). */
  waitFor(role: string, name?: string, timeout = 3, extra: Partial<Selector> = {}): this {
    this.steps.push({ op: "waitFor", role, name, timeout, ...extra });
    return this;
  }
  /** Assert an element exists (or, with not=true, does not). */
  assertExists(sel: Selector, not = false): this {
    this.steps.push({ op: "assertExists", not, ...sel });
    return this;
  }
  /** Driver-side equality assertion on a prior read. */
  assertEquals(get: string, equals: string): this {
    this.steps.push({ op: "assertEquals", get, equals });
    return this;
  }
  /** Driver-side substring assertion on a prior read. */
  assertContains(get: string, substring: string): this {
    this.steps.push({ op: "assertContains", get, substring });
    return this;
  }
  /** Capture the interesting AX subtree into reads[as] (debugging/authoring). */
  dump(as = "dump", maxDepth = 24): this {
    this.steps.push({ op: "dump", as, maxDepth });
    return this;
  }
  /** Escape hatch: push a raw step the builder doesn't cover. */
  raw(step: Step): this {
    this.steps.push(step);
    return this;
  }

  /** Run the whole flow in one osascript pass and return the parsed transcript. */
  async run(): Promise<FlowResult> {
    const payload = JSON.stringify({ steps: this.steps, options: this.opts });
    const proc = Bun.spawn(["osascript", "-l", "JavaScript", DRIVER, payload], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    const text = out.trim();
    if (!text) {
      throw new Error("AX driver returned no output. stderr:\n" + err.trim());
    }
    let parsed: FlowResult;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("AX driver output was not JSON:\n" + text + "\nstderr:\n" + err.trim());
    }
    return parsed;
  }
}

/** Start a flow against the app window with the given title. */
export function app(windowTitle: string, opts?: { continueOnError?: boolean }): Flow {
  return new Flow(windowTitle, opts);
}

/** Throw with a readable transcript if any step failed. Use after run(). */
export function assertFlowOk(r: FlowResult): void {
  if (r.ok) return;
  const failed = r.steps.filter((s) => !s.ok).map((s) => `  ✗ ${s.op}: ${s.error}`);
  const passed = r.steps.filter((s) => s.ok).map((s) => `  ✓ ${s.op}`);
  throw new Error("AX flow failed:\n" + [...passed, ...failed].join("\n"));
}
