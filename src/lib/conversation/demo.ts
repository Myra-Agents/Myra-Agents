// Demo conversations for `bun run dev` (browser backend). These let the
// Conversation tab render a full Claude-style transcript without a live agent.
// `DEMO_RUN_LOGS` maps a run id to a raw stream-json log (exactly what
// `get_run_log` would return); `demoCards()` seeds matching cards with run
// history so the Logs page lists them. Real runs use the same parser.

import type { AgentRun, KanbanCard } from "@/types/kanban";

/** Build a Claude `--output-format stream-json` log from event objects. */
function streamLog(events: Array<Record<string, unknown>>): string {
  return events.map((e) => JSON.stringify(e)).join("\n");
}

const asst = (...content: Array<Record<string, unknown>>) => ({
  type: "assistant",
  message: { role: "assistant", content },
});
const toolResult = (id: string, content: string, isError = false) => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] },
});

// ── 1. Dark-mode toggle: Read → Edit → typecheck → done ──────────────────────
const DARKMODE_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Read", "Edit", "Bash"] },
  asst({
    type: "text",
    text: "I'll add a dark-mode toggle. Let me first look at the existing theme provider to match its conventions.",
  }),
  asst({ type: "tool_use", id: "t1", name: "Read", input: { file_path: "src/hooks/use-theme.ts" } }),
  toolResult(
    "t1",
    'export type Theme = "light" | "dark" | "system";\n\nexport function useTheme() {\n  const [theme, setTheme] = useState<Theme>("system");\n  // …reads/writes localStorage "myra:theme"\n  return { theme, setTheme };\n}',
  ),
  asst({
    type: "thinking",
    thinking:
      "The hook already supports light/dark/system and persists to localStorage. So I only need a UI control that calls setTheme — no new state plumbing. A three-way SegmentedControl is cleanest and matches the settings page.",
  }),
  asst({ type: "text", text: "The hook already handles persistence. I'll add a segmented control to the header." }),
  asst({
    type: "tool_use",
    id: "t2",
    name: "Edit",
    input: {
      file_path: "src/components/theme-toggle.tsx",
      old_string: "// placeholder",
      new_string:
        'export function ThemeToggle() {\n  const { theme, setTheme } = useTheme();\n  return (\n    <SegmentedControl value={theme} onChange={setTheme}\n      options={["light", "dark", "system"]} />\n  );\n}',
    },
  }),
  toolResult("t2", "Edited src/components/theme-toggle.tsx — 1 hunk applied."),
  asst({ type: "text", text: "Now let me typecheck to be sure nothing broke." }),
  asst({ type: "tool_use", id: "t3", name: "Bash", input: { command: "npx tsc --noEmit", description: "Typecheck" } }),
  toolResult("t3", "✓ No type errors (2.4s)"),
  asst({
    type: "text",
    text: "Done. The toggle is wired to the existing `useTheme` hook, so the choice persists across launches.\n\n**Changed:**\n- `src/components/theme-toggle.tsx` — new `ThemeToggle` segmented control\n\nTypecheck passes.",
  }),
  {
    type: "result",
    subtype: "success",
    result:
      "Added a `ThemeToggle` segmented control (light / dark / system) wired to the existing `useTheme` hook. Typecheck passes.",
    total_cost_usd: 0.0421,
    num_turns: 4,
    duration_ms: 18340,
    usage: { input_tokens: 11240, output_tokens: 868 },
  },
]);

// ── 2. Flaky test: investigate → fix a race ──────────────────────────────────
const FLAKY_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Grep", "Bash", "Read", "Edit"] },
  asst({
    type: "thinking",
    thinking:
      "A flaky auth test usually means a timing race or shared state between tests. Let me find the test, then run it in a loop to reproduce before changing anything.",
  }),
  asst({ type: "text", text: "Let me locate the test and reproduce the flake first." }),
  asst({ type: "tool_use", id: "f1", name: "Grep", input: { pattern: "describe.*auth", path: "tests" } }),
  toolResult("f1", "tests/auth.test.ts:12:describe('auth flow', () => {"),
  asst({
    type: "tool_use",
    id: "f2",
    name: "Bash",
    input: {
      command: "for i in $(seq 1 20); do bun test tests/auth.test.ts; done | grep -c FAIL",
      description: "Repro",
    },
  }),
  toolResult("f2", "3", false),
  asst({
    type: "text",
    text: "Fails 3/20 runs — a real race. The token-refresh promise isn't awaited before the assertion. Fixing:",
  }),
  asst({
    type: "tool_use",
    id: "f3",
    name: "Edit",
    input: {
      file_path: "tests/auth.test.ts",
      old_string: "  refreshToken();\n  expect(session.token).toBe(next);",
      new_string: "  await refreshToken();\n  expect(session.token).toBe(next);",
    },
  }),
  toolResult("f3", "Edited tests/auth.test.ts — 1 hunk applied."),
  asst({
    type: "tool_use",
    id: "f4",
    name: "Bash",
    input: {
      command: "for i in $(seq 1 50); do bun test tests/auth.test.ts; done | grep -c FAIL",
      description: "Verify",
    },
  }),
  toolResult("f4", "0", false),
  asst({ type: "text", text: "0/50 failures after awaiting the refresh. The race is fixed." }),
  {
    type: "result",
    subtype: "success",
    result:
      "Root cause: `refreshToken()` was not awaited before asserting the new token, so the assertion sometimes ran against the stale value. Added `await`; 50/50 passes. Please review.",
    total_cost_usd: 0.0689,
    num_turns: 5,
    duration_ms: 41210,
    usage: { input_tokens: 18900, output_tokens: 1320 },
  },
]);

// ── 3. Plain-text log (e.g. opencode without stream-json) → fallback render ──
const PLAIN_LOG = `> Updating README badges

Reading README.md…
Found 3 shield badges (build, license, version).
The version badge points to v0.4.0 but package.json is v0.6.1.

Patching badge URL → v0.6.1
Adding a "downloads" badge.

Done. README.md updated with 4 badges, version corrected to v0.6.1.`;

export const DEMO_RUN_LOGS: Record<string, string> = {
  "run-darkmode": DARKMODE_LOG,
  "run-flaky": FLAKY_LOG,
  "run-readme": PLAIN_LOG,
};

const run = (id: string, status: AgentRun["status"], prompt: string, extra: Partial<AgentRun>): AgentRun => ({
  id,
  startedAt: extra.startedAt ?? "2026-06-13T09:00:00.000Z",
  endedAt: extra.endedAt,
  prompt,
  status,
  ...extra,
});

/** Demo cards (bare entity ids) with run history, seeded when the store is
 * empty so the Logs page has conversations to show in `bun run dev`. */
export function demoCards(): KanbanCard[] {
  const base = {
    description: "",
    createdAt: "2026-06-13T08:55:00.000Z",
    updatedAt: "2026-06-13T09:20:00.000Z",
    tags: ["✨ demo"],
  };
  return [
    {
      ...base,
      id: "demo-darkmode",
      title: "Add a dark-mode toggle to the header",
      status: "done",
      position: 1000,
      runHistory: [
        run("run-darkmode", "completed", "Add a dark-mode toggle to the header.", {
          startedAt: "2026-06-13T09:00:00.000Z",
          endedAt: "2026-06-13T09:00:18.340Z",
          exitCode: 0,
          tokens: 12108,
          cost: 0.0421,
          result: "Added a ThemeToggle segmented control wired to useTheme. Typecheck passes.",
        }),
      ],
    },
    {
      ...base,
      id: "demo-flaky",
      title: "Fix the flaky auth test",
      status: "awaiting_review",
      position: 1000,
      runHistory: [
        run("run-flaky", "awaiting_review", "The auth flow test fails intermittently in CI. Find and fix the flake.", {
          startedAt: "2026-06-13T09:05:00.000Z",
          endedAt: "2026-06-13T09:05:41.210Z",
          exitCode: 0,
          tokens: 20220,
          cost: 0.0689,
          result: "Awaited the token refresh that was racing the assertion. 50/50 passes.",
        }),
      ],
    },
    {
      ...base,
      id: "demo-readme",
      title: "Update the README badges",
      status: "done",
      position: 2000,
      runHistory: [
        run("run-readme", "completed", "Update the README badges to match the current version.", {
          startedAt: "2026-06-13T09:12:00.000Z",
          endedAt: "2026-06-13T09:12:09.000Z",
          exitCode: 0,
          result: "README badges updated; version corrected to v0.6.1.",
        }),
      ],
    },
  ];
}
