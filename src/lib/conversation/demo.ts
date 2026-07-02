// Demo conversations for `bun run dev` (browser backend). These let the
// Conversation tab render a full Claude-style transcript without a live agent.
// `DEMO_RUN_LOGS` maps a run id to a raw stream-json log (exactly what
// `get_run_log` would return); `demoCards()` seeds matching cards with run
// history so the Logs page lists them. Real runs use the same parser.

import type { AgentRun, KanbanCard } from "@/types/kanban";
import type { ScheduledTask } from "@/types/schedule";

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

// ── 4. Real opencode/qwen terminal log (ANSI + `[err]` tags + markers) ───────
// Verbatim shape of a captured opencode run: stdout prose is untagged, the
// action trail is `[err] `-tagged with ANSI colors. The parser strips the
// noise and rebuilds it as a clean transcript. `[…m` are ANSI escapes.
const E = ""; // ESC, so the demo carries genuine ANSI to strip
const OPENCODE_LOG = [
  `[err] ${E}[0m`,
  `[err] > build · qwen3-coder:latest`,
  `[err] ${E}[0m`,
  "I need to gather information about changes in the repositories since yesterday: new commits, open PRs, failing checks. Let me check the repo status first.",
  `[err] ${E}[0m$ ${E}[0mcd /Users/val/Workspace/Myra-Agents-Dev/app && git status`,
  "[err] On branch feature/sidebar-header-controls",
  "[err] Your branch is up to date with 'origin/feature/sidebar-header-controls'.",
  "[err] ",
  "[err] Changes not staged for commit:",
  "[err] \tmodified:   packages/shared (new commits)",
  "[err] ",
  "[err] Untracked files:",
  "[err] \tbuild-in-public/",
  "Let me check the recent commits:",
  `[err] ${E}[0m$ ${E}[0mgit log --oneline -5`,
  "[err] de46211 Move collapse + search into sidebar header",
  "[err] 7704785 refactor(tray): remove unused RefreshCwIcon",
  "[err] d697772 Merge pull request #170 from posthog-error-tracking-logs",
  "I'll look up the open PRs on the shared repo:",
  `[err] ${E}[90m% ${E}[0mWebFetch https://api.github.com/repos/Myra-Agents/Myra-Agents-Shared/pulls?state=open`,
  `[err] ${E}[91m${E}[1m✗ ${E}[0mRead app/packages/shared/src/types/plugins.ts failed`,
  "[err] Error: File not found: app/packages/shared/src/types/plugins.ts",
  `[err] ${E}[90m✱ ${E}[0mGlob "**/plugins.ts" 0 matches`,
  "[err] → Read app/packages/shared/src/types/settings.ts",
  "I've found the PluginInfo interface. Let me add the three protocol-compatibility fields.",
  "[err] ← Edit app/packages/shared/src/types/settings.ts",
  "[err] @@ -491,8 +491,17 @@",
  "[err]    config: PluginConfigField[];",
  "[err]    enabled: boolean;",
  "[err] +  compatible: boolean;",
  "[err] +  incompatibleReason?: string;",
  "[err] +  minProtocol?: string;",
  "[err]  }",
  "I've updated the PluginInfo interface with `compatible`, `incompatibleReason`, and `minProtocol`. TypeScript compiles clean.",
  `[err] ${E}[0m[myra-agents] OpenCode Local (opencode) exited with code 0`,
].join("\n");

// ── 5. In-progress run: refactor still streaming (no terminal `result`) ──────
// A run captured mid-flight — the agent has read the file and applied the first
// edit but hasn't finished. There is no `result` event, so the transcript ends
// on a live tool call: this is what the Logs view shows for a running card.
const RUNNING_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Grep", "Read", "Edit", "Bash"] },
  asst({
    type: "text",
    text: "I'll split the settings page into tabs (General · Agents · Advanced). Let me find the current panel first.",
  }),
  asst({
    type: "tool_use",
    id: "s1",
    name: "Grep",
    input: { pattern: "SettingsPanel", path: "src/components/settings" },
  }),
  toolResult("s1", "src/components/settings/settings-panel.tsx:18:export function SettingsPanel() {"),
  asst({
    type: "thinking",
    thinking:
      "The panel is one long scroll of sections. There's already a `Tabs` primitive in components/ui — I'll reuse it rather than build a new one, and keep each existing section as a tab body so I don't touch the form logic.",
  }),
  asst({
    type: "tool_use",
    id: "s2",
    name: "Read",
    input: { file_path: "src/components/settings/settings-panel.tsx" },
  }),
  toolResult(
    "s2",
    'export function SettingsPanel() {\n  return (\n    <div className="flex flex-col gap-8">\n      <GeneralSection />\n      <AgentsSection />\n      <AdvancedSection />\n    </div>\n  );\n}',
  ),
  asst({ type: "text", text: "Three clean sections already. I'll wrap them in the shared `Tabs` primitive." }),
  asst({
    type: "tool_use",
    id: "s3",
    name: "Edit",
    input: {
      file_path: "src/components/settings/settings-panel.tsx",
      old_string:
        '<div className="flex flex-col gap-8">\n      <GeneralSection />\n      <AgentsSection />\n      <AdvancedSection />\n    </div>',
      new_string:
        '<Tabs defaultValue="general">\n      <TabsList>\n        <TabsTrigger value="general">General</TabsTrigger>\n        <TabsTrigger value="agents">Agents</TabsTrigger>\n        <TabsTrigger value="advanced">Advanced</TabsTrigger>\n      </TabsList>\n      <TabsContent value="general"><GeneralSection /></TabsContent>\n      <TabsContent value="agents"><AgentsSection /></TabsContent>\n      <TabsContent value="advanced"><AdvancedSection /></TabsContent>\n    </Tabs>',
    },
  }),
  toolResult("s3", "Edited src/components/settings/settings-panel.tsx — 1 hunk applied."),
  asst({ type: "text", text: "Now adding the `Tabs` import and typechecking the change." }),
  asst({ type: "tool_use", id: "s4", name: "Bash", input: { command: "npx tsc --noEmit", description: "Typecheck" } }),
  // No tool_result / result yet — the run is still in flight.
]);

// ── 6. Needs-feedback run: ends on a question, no terminal result ─────────────
// The agent gathers context, hits a genuine decision it can't make alone, and
// asks. The card's `agentQuestion` mirrors the closing turn; the run stays in
// "Needs you" until the human answers.
const FEEDBACK_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Read", "Grep", "Bash"] },
  asst({
    type: "text",
    text: "Wiring Stripe checkout. Let me see what's already present so I don't duplicate config.",
  }),
  asst({ type: "tool_use", id: "p1", name: "Grep", input: { pattern: "stripe", path: "src", "-i": true } }),
  toolResult("p1", "No matches found.", false),
  asst({ type: "tool_use", id: "p2", name: "Read", input: { file_path: "package.json" } }),
  toolResult("p2", '{\n  "dependencies": {\n    "next": "16.0.0",\n    "react": "19.0.0"\n  }\n}'),
  asst({
    type: "thinking",
    thinking:
      "No Stripe SDK and no env keys. The implementation forks hard on the model: a one-off Checkout Session is a few lines, but a subscription needs Products/Prices, a customer portal, and webhook handling for `invoice.*`. I shouldn't guess — the wrong choice is hours of rework.",
  }),
  asst({
    type: "text",
    text: "There's no Stripe wiring yet, so I'm starting clean. Before I scaffold it I need one decision from you:\n\n**Is this a one-time payment or a recurring subscription?** It changes everything downstream — a subscription needs Products/Prices, a customer portal, and `invoice.*` webhook handling, whereas a one-off is a single Checkout Session. Which one should I build?",
  }),
]);

// ── 7. Failed run: a migration that the agent can't complete, exits non-zero ─
const FAILED_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Bash", "Read", "Edit"] },
  asst({ type: "text", text: "Migrating the ESLint rules to Biome. I'll run the official codemod first." }),
  asst({
    type: "tool_use",
    id: "m1",
    name: "Bash",
    input: { command: "npx @biomejs/biome migrate eslint --write", description: "Run Biome migration" },
  }),
  toolResult(
    "m1",
    "✖ Cannot find an ESLint configuration file. Tried .eslintrc.json, .eslintrc.js, eslint.config.js.\nThe project uses a non-standard `eslintConfig` key in package.json that the codemod does not read.",
    true,
  ),
  asst({
    type: "text",
    text: "The codemod can't read the inline `eslintConfig` block in package.json. Let me extract it to a real config file and retry.",
  }),
  asst({
    type: "tool_use",
    id: "m2",
    name: "Bash",
    input: { command: "npx @biomejs/biome migrate eslint --write", description: "Retry after extracting config" },
  }),
  toolResult(
    "m2",
    "✖ Unsupported rule: `import/order` has no Biome equivalent and 3 custom plugin rules (`@myra/*`) cannot be mapped automatically.",
    true,
  ),
  asst({
    type: "text",
    text: "This needs a human decision. Three custom `@myra/*` lint rules have no Biome equivalent, so an automatic migration would silently drop them. I'm stopping rather than ship a config that weakens our linting.",
  }),
  {
    type: "result",
    subtype: "error_during_execution",
    result:
      "Could not complete the migration: 3 custom `@myra/*` ESLint rules have no Biome equivalent and would be dropped. Needs a manual mapping decision before retrying.",
    total_cost_usd: 0.0512,
    num_turns: 3,
    duration_ms: 22870,
    usage: { input_tokens: 9400, output_tokens: 640 },
  },
]);

// ── 8. First (failed) attempt at the flaky test — wrong fix, still flaky ──────
const FLAKY_FAIL_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Grep", "Bash", "Edit"] },
  asst({
    type: "thinking",
    thinking: "Flaky auth test — my first guess is a too-tight timeout. Let me bump it and see if the failures stop.",
  }),
  asst({
    type: "tool_use",
    id: "x1",
    name: "Bash",
    input: {
      command: "for i in $(seq 1 20); do bun test tests/auth.test.ts; done | grep -c FAIL",
      description: "Repro",
    },
  }),
  toolResult("x1", "3", false),
  asst({ type: "text", text: "3/20 failures. I'll increase the assertion timeout from 1s to 5s." }),
  asst({
    type: "tool_use",
    id: "x2",
    name: "Edit",
    input: {
      file_path: "tests/auth.test.ts",
      old_string: "{ timeout: 1000 }",
      new_string: "{ timeout: 5000 }",
    },
  }),
  toolResult("x2", "Edited tests/auth.test.ts — 1 hunk applied."),
  asst({
    type: "tool_use",
    id: "x3",
    name: "Bash",
    input: {
      command: "for i in $(seq 1 30); do bun test tests/auth.test.ts; done | grep -c FAIL",
      description: "Verify",
    },
  }),
  toolResult("x3", "2", false),
  asst({
    type: "text",
    text: "Still 2/30 — the timeout wasn't the cause, it's a real race. Reverting the timeout bump; this needs a proper fix (awaiting the refresh promise), which I'll do in a fresh attempt.",
  }),
  {
    type: "result",
    subtype: "error_during_execution",
    result:
      "Bumping the timeout didn't fix it — the test is racing an un-awaited token refresh, not timing out. Reverted; needs a real await. Failed.",
    total_cost_usd: 0.0394,
    num_turns: 3,
    duration_ms: 28110,
    usage: { input_tokens: 10200, output_tokens: 720 },
  },
]);

// ── 9. Dependency bump: read → patch → install → typecheck → done ────────────
const DEPS_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Bash", "Edit"] },
  asst({ type: "text", text: "Checking which dependencies are outdated and which are safe (non-major) bumps." }),
  asst({ type: "tool_use", id: "d1", name: "Bash", input: { command: "bun outdated", description: "List outdated" } }),
  toolResult(
    "d1",
    "Package        Current  Wanted  Latest\nzod            3.22.4   3.23.8  3.23.8\nsonner         1.4.0    1.7.1   1.7.1\nlucide-react   0.378.0  0.379.0 0.460.0",
  ),
  asst({
    type: "thinking",
    thinking:
      "zod and sonner are within the same major — safe. lucide-react latest jumps a lot of minors; I'll take the wanted (0.379.0) to stay conservative and avoid icon renames.",
  }),
  asst({ type: "text", text: "Bumping zod, sonner, and lucide-react to their `wanted` (same-major) versions." }),
  asst({
    type: "tool_use",
    id: "d2",
    name: "Bash",
    input: { command: "bun add zod@3.23.8 sonner@1.7.1 lucide-react@0.379.0", description: "Bump deps" },
  }),
  toolResult("d2", "✓ Installed 3 packages in 4.1s"),
  asst({ type: "tool_use", id: "d3", name: "Bash", input: { command: "npx tsc --noEmit", description: "Typecheck" } }),
  toolResult("d3", "✓ No type errors (3.0s)"),
  asst({
    type: "text",
    text: "All three bumped within-major and the typecheck is clean. Majors (lucide-react 0.460) left for a separate, reviewed PR.",
  }),
  {
    type: "result",
    subtype: "success",
    result:
      "Bumped zod → 3.23.8, sonner → 1.7.1, lucide-react → 0.379.0 (all same-major, safe). Typecheck passes. Held back the lucide-react major for a dedicated PR.",
    total_cost_usd: 0.0337,
    num_turns: 4,
    duration_ms: 16450,
    usage: { input_tokens: 8600, output_tokens: 540 },
  },
]);

// ── 10. i18n sweep: extract hardcoded strings into en/fr message catalogs ────
const I18N_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Grep", "Read", "Edit"] },
  asst({
    type: "text",
    text: "Finding user-facing strings hardcoded in the trash zone component so they can move to next-intl.",
  }),
  asst({
    type: "tool_use",
    id: "i1",
    name: "Grep",
    input: { pattern: ">[A-Z][a-z].*<", path: "src/components/kanban/trash-zone.tsx" },
  }),
  toolResult(
    "i1",
    "trash-zone.tsx:24:        <span>Drop here to delete</span>\ntrash-zone.tsx:31:        <button>Empty trash</button>",
  ),
  asst({ type: "text", text: 'Two strings: "Drop here to delete" and "Empty trash". Adding keys to both catalogs.' }),
  asst({
    type: "tool_use",
    id: "i2",
    name: "Edit",
    input: {
      file_path: "src/messages/en.json",
      old_string: '"trash": {',
      new_string: '"trash": {\n    "dropHint": "Drop here to delete",\n    "empty": "Empty trash",',
    },
  }),
  toolResult("i2", "Edited src/messages/en.json — 1 hunk applied."),
  asst({
    type: "tool_use",
    id: "i3",
    name: "Edit",
    input: {
      file_path: "src/messages/fr.json",
      old_string: '"trash": {',
      new_string: '"trash": {\n    "dropHint": "Déposer ici pour supprimer",\n    "empty": "Vider la corbeille",',
    },
  }),
  toolResult("i3", "Edited src/messages/fr.json — 1 hunk applied."),
  asst({
    type: "tool_use",
    id: "i4",
    name: "Edit",
    input: {
      file_path: "src/components/kanban/trash-zone.tsx",
      old_string: "<span>Drop here to delete</span>",
      new_string: '<span>{t("dropHint")}</span>',
    },
  }),
  toolResult("i4", "Edited src/components/kanban/trash-zone.tsx — 1 hunk applied."),
  asst({
    type: "text",
    text: 'Both strings now route through `useTranslations("trash")`, with matching en + fr keys.',
  }),
  {
    type: "result",
    subtype: "success",
    result:
      'Extracted "Drop here to delete" and "Empty trash" from the trash zone into the `trash` namespace, with English and French translations. No more hardcoded copy in that component.',
    total_cost_usd: 0.0455,
    num_turns: 5,
    duration_ms: 24600,
    usage: { input_tokens: 13100, output_tokens: 910 },
  },
]);

// ── 11. UI showcase: every conversation block type in one run ─────────────────
// Exercises every renderer: thinking, markdown headings/bold/code/lists, fenced
// code block, tool calls (Read/Edit/Bash/Grep/WebFetch/TodoWrite), a diff
// output, an error tool result, and a result footer with cost + tokens.
const SHOWCASE_LOG = streamLog([
  { type: "system", subtype: "init", model: "claude-opus-4-8", tools: ["Read", "Edit", "Bash", "Grep", "WebFetch", "TodoWrite"] },
  asst({
    type: "thinking",
    thinking:
      "The task is to audit the conversation renderer and make sure every block type is exercised. I'll:\n1. Read the types file to confirm the full list\n2. Check the markdown renderer handles headings, bold, inline code, fenced blocks, bullet + numbered lists\n3. Show a tool with a diff output\n4. Show an error tool result\n5. Show a multi-field TodoWrite\n\nLet me start by reading the types so I can enumerate them precisely.",
  }),
  asst({
    type: "text",
    text: "## Showcase — all conversation block types\n\nThis run exercises **every** renderer in `conversation-view.tsx`. Here's the plan:\n\n1. `thinking` — collapsible reasoning (you're reading it above)\n2. `text` — this block: headings, **bold**, `inline code`, fenced code, lists\n3. `tool_use` — Read, Edit (with diff), Bash, Grep, WebFetch, TodoWrite\n4. `tool_result` with `isError: true`\n5. `result` footer with cost + tokens + duration\n\n### Markdown features\n\n**Bold text**, `inline code`, and mixed: **`bold-code`** isn't supported — that's fine.\n\n#### Fenced code block\n\n```typescript\ntype TranscriptEntry =\n  | { kind: 'user';       text: string }\n  | { kind: 'text';       text: string }\n  | { kind: 'thinking';   text: string }\n  | { kind: 'tool_use';   id: string; name: string; input: Record<string, unknown> }\n  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }\n  | { kind: 'result';     summary: string; tokens?: number; cost?: number };\n```\n\n#### Bullet list\n\n- Item alpha — plain text\n- Item beta — with `inline code`\n- Item gamma — with **bold**\n\n#### Numbered list\n\n1. First step — read the file\n2. Second step — apply the edit\n3. Third step — typecheck",
  }),
  asst({ type: "tool_use", id: "sh1", name: "Read", input: { file_path: "src/lib/conversation/types.ts" } }),
  toolResult(
    "sh1",
    "export type TranscriptEntry = UserEntry | TextEntry | ThinkingEntry | ToolUseEntry | ToolResultEntry | ResultEntry;\n\nexport interface ThinkingEntry { kind: 'thinking'; text: string; }\nexport interface ToolUseEntry  { kind: 'tool_use'; id: string; name: string; input: Record<string, unknown>; }\nexport interface ToolResultEntry { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean; }\nexport interface ResultEntry { kind: 'result'; summary: string; tokens?: number; cost?: number; durationMs?: number; numTurns?: number; isError: boolean; }",
  ),
  asst({ type: "text", text: "Good — six kinds confirmed. Now let me grep for any rendering path I might miss." }),
  asst({ type: "tool_use", id: "sh2", name: "Grep", input: { pattern: "case \"", path: "src/components/conversation/conversation-view.tsx" } }),
  toolResult(
    "sh2",
    "conversation-view.tsx:102:    case \"user\":\nconversation-view.tsx:104:    case \"text\":\nconversation-view.tsx:106:    case \"thinking\":\nconversation-view.tsx:108:    case \"tool_use\":\nconversation-view.tsx:110:    case \"tool_result\":\nconversation-view.tsx:112:    case \"result\":",
  ),
  asst({
    type: "thinking",
    thinking: "All six cases are present. The diff renderer is triggered by `looksLikeDiff` on the tool result content — I need to show a result that starts with `@@` so it renders as a diff view rather than a plain pre block.",
  }),
  asst({ type: "text", text: "All six `case` branches found. Now applying the Edit so the diff view triggers." }),
  asst({
    type: "tool_use",
    id: "sh3",
    name: "Edit",
    input: {
      file_path: "src/lib/conversation/demo.ts",
      old_string: "// placeholder",
      new_string: "// SHOWCASE_LOG added",
    },
  }),
  toolResult(
    "sh3",
    "@@ -471,6 +471,7 @@\n export const DEMO_RUN_LOGS: Record<string, string> = {\n   \"run-darkmode\": DARKMODE_LOG,\n+  \"run-showcase\": SHOWCASE_LOG,\n   \"run-flaky\": FLAKY_LOG,\n };",
  ),
  asst({ type: "text", text: "Diff rendered above. Running a typecheck to confirm nothing is broken." }),
  asst({
    type: "tool_use",
    id: "sh4",
    name: "Bash",
    input: { command: "npx tsc --noEmit", description: "Typecheck" },
  }),
  toolResult("sh4", "✓ No type errors (2.1s)"),
  asst({ type: "text", text: "Clean. Let me also fetch the MDN page for `@@` hunk format to document it." }),
  asst({
    type: "tool_use",
    id: "sh5",
    name: "WebFetch",
    input: { url: "https://www.gnu.org/software/diffutils/manual/html_node/Detailed-Unified.html", description: "Unified diff format" },
  }),
  toolResult(
    "sh5",
    "GNU Diffutils: Detailed Description of Unified Format\n\nA unified diff hunk header looks like:\n  @@ -l,s +l,s @@\nwhere l is the starting line number and s is the number of lines in the hunk.\nLines beginning with '+' are additions; '-' are deletions; ' ' is context.",
  ),
  asst({ type: "text", text: "Now writing the remaining items to the to-do list." }),
  asst({
    type: "tool_use",
    id: "sh6",
    name: "TodoWrite",
    input: {
      todos: [
        { id: "1", content: "Add SHOWCASE_LOG to DEMO_RUN_LOGS map", status: "completed", priority: "high" },
        { id: "2", content: "Add matching demo card in demoCards()", status: "in_progress", priority: "high" },
        { id: "3", content: "Verify in bun run dev that all blocks render", status: "pending", priority: "medium" },
        { id: "4", content: "Screenshot for PR description", status: "pending", priority: "low" },
      ],
    },
  }),
  toolResult("sh6", "4 todos written."),
  asst({ type: "text", text: "Attempting a step that will fail — reading a non-existent file — to show the error state." }),
  asst({
    type: "tool_use",
    id: "sh7",
    name: "Read",
    input: { file_path: "src/lib/conversation/does-not-exist.ts" },
  }),
  toolResult("sh7", "Error: ENOENT: no such file or directory 'src/lib/conversation/does-not-exist.ts'", true),
  asst({ type: "text", text: "Error state rendered in red above — expected. Showcase complete." }),
  {
    type: "result",
    subtype: "success",
    result:
      "All six conversation block types exercised in one run:\n\n- **thinking** — collapsible reasoning (×2)\n- **text** — markdown with headings, bold, inline code, fenced block, bullet + numbered lists\n- **tool_use** — Read ×2, Grep, Edit (→ diff), Bash, WebFetch, TodoWrite\n- **tool_result** with `isError: true` (error state)\n- **result** footer — summary, cost, tokens, duration, turns\n\nTypecheck passes.",
    total_cost_usd: 0.0871,
    num_turns: 8,
    duration_ms: 34560,
    usage: { input_tokens: 21400, output_tokens: 1840 },
  },
]);

export const DEMO_RUN_LOGS: Record<string, string> = {
  "run-darkmode": DARKMODE_LOG,
  "run-flaky": FLAKY_LOG,
  "run-flaky-1": FLAKY_FAIL_LOG,
  "run-readme": PLAIN_LOG,
  "run-opencode": OPENCODE_LOG,
  "run-settings-tabs": RUNNING_LOG,
  "run-stripe": FEEDBACK_LOG,
  "run-eslint": FAILED_LOG,
  "run-deps": DEPS_LOG,
  "run-i18n": I18N_LOG,
  "run-showcase": SHOWCASE_LOG,
};

const run = (id: string, status: AgentRun["status"], prompt: string, extra: Partial<AgentRun>): AgentRun => ({
  id,
  startedAt: extra.startedAt ?? new Date().toISOString(),
  endedAt: extra.endedAt,
  prompt,
  status,
  ...extra,
});

/**
 * Demo cards (bare entity ids) with run history, seeded once when the store is
 * empty so the Runs / History / Logs views all have real-looking executions in
 * `bun run dev`. Timestamps are anchored to "now" at seed time so the Runs board
 * shows a live-growing duration on the running card and the History trend graphs
 * land inside the today / 7-day windows. Every bucket is populated:
 *   - **backlog** (`todo`): queued, not yet run — one fresh, one retry-after-fail
 *   - **running** (`in_progress`): mid-flight, no end time → duration ticks up
 *   - **needs you** (`waiting_feedback` + `awaiting_review`): a pending question
 *     and a finished run awaiting sign-off
 *   - **done**: several completed runs (plus a failed attempt in history) so the
 *     History stats, success-rate line and token totals are non-trivial
 * Each `runHistory[].id` keys into {@link DEMO_RUN_LOGS} so the transcript renders.
 */
export function demoCards(): KanbanCard[] {
  const now = Date.now();
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();

  const base = {
    description: "",
    tags: ["✨ demo"],
    agentPresetId: "opencode",
  };

  return [
    // ── Backlog (todo) ───────────────────────────────────────────────────────
    {
      ...base,
      id: "demo-shortcuts",
      title: "Add keyboard shortcuts to the command palette",
      description: "⌘K already opens the palette — add j/k navigation and ⌘↵ to run the highlighted action.",
      status: "todo",
      position: 1000,
      createdAt: at(12 * MIN),
      updatedAt: at(12 * MIN),
      agentQueued: true,
      tags: ["✨ demo", "ux"],
    },
    {
      ...base,
      id: "demo-eslint",
      title: "Migrate the ESLint rules to Biome",
      description: "Tried once; the codemod can't map our custom @myra/* rules. Back in the queue pending a decision.",
      status: "todo",
      position: 2000,
      createdAt: at(6 * DAY),
      updatedAt: at(6 * DAY + 22 * MIN),
      // A prior attempt that failed — surfaces on the History page as a failure.
      runHistory: [
        run("run-eslint", "failed", "Migrate our ESLint configuration to Biome.", {
          startedAt: at(6 * DAY),
          endedAt: at(6 * DAY - 22870),
          exitCode: 1,
          tokens: 10040,
          cost: 0.0512,
          result: "3 custom @myra/* rules have no Biome equivalent; stopped before weakening the lint config.",
        }),
      ],
    },

    // ── Running (in_progress) ────────────────────────────────────────────────
    {
      ...base,
      id: "demo-settings-tabs",
      title: "Refactor the settings panel into tabs",
      description: "Split the long settings scroll into General · Agents · Advanced tabs.",
      status: "in_progress",
      position: 1000,
      createdAt: at(8 * MIN),
      updatedAt: at(30_000),
      tags: ["✨ demo", "refactor"],
      // Live run: started, no end → the Runs board duration keeps ticking.
      agentRunId: "run-settings-tabs",
      agentRunStartedAt: at(4 * MIN),
      runHistory: [
        run("run-settings-tabs", "running", "Refactor the settings panel into tabs.", {
          startedAt: at(4 * MIN),
        }),
      ],
    },

    // ── Needs you (waiting_feedback) ─────────────────────────────────────────
    {
      ...base,
      id: "demo-stripe",
      title: "Wire up Stripe checkout",
      description: "Add a Stripe-hosted checkout flow for the Pro plan.",
      status: "waiting_feedback",
      position: 1000,
      createdAt: at(28 * MIN),
      updatedAt: at(21 * MIN),
      tags: ["✨ demo", "billing"],
      agentRunId: "run-stripe",
      agentRunStartedAt: at(24 * MIN),
      agentQuestion:
        "Is this a one-time payment or a recurring subscription? It changes the whole setup — a subscription needs Products/Prices, a customer portal and invoice webhooks, vs. a single Checkout Session for a one-off.",
      runHistory: [
        run("run-stripe", "needs_feedback", "Wire up a Stripe-hosted checkout for the Pro plan.", {
          startedAt: at(24 * MIN),
        }),
      ],
    },

    // ── Needs you (awaiting_review) ──────────────────────────────────────────
    {
      ...base,
      id: "demo-flaky",
      title: "Fix the flaky auth test",
      description: "The auth flow test fails ~3/20 runs in CI.",
      status: "awaiting_review",
      position: 1000,
      createdAt: at(3 * DAY),
      updatedAt: at(35 * MIN),
      tags: ["✨ demo", "tests"],
      agentRunId: "run-flaky",
      agentRunStartedAt: at(40 * MIN),
      agentRunEndedAt: at(40 * MIN - 41210),
      agentResult: "Awaited the token refresh that was racing the assertion. 50/50 passes.",
      // Two attempts: the first (timeout bump) failed, the second fixed the race.
      runHistory: [
        run("run-flaky-1", "failed", "The auth flow test fails intermittently in CI. Find and fix the flake.", {
          startedAt: at(3 * DAY),
          endedAt: at(3 * DAY - 28110),
          exitCode: 1,
          tokens: 10920,
          cost: 0.0394,
          result: "Bumping the timeout didn't help — it's a real race, not a slow test. Reverted.",
        }),
        run("run-flaky", "awaiting_review", "The auth flow test fails intermittently in CI. Find and fix the flake.", {
          startedAt: at(40 * MIN),
          endedAt: at(40 * MIN - 41210),
          exitCode: 0,
          tokens: 20220,
          cost: 0.0689,
          result: "Awaited the token refresh that was racing the assertion. 50/50 passes.",
        }),
      ],
    },

    // ── Done ─────────────────────────────────────────────────────────────────
    {
      ...base,
      id: "demo-darkmode",
      title: "Add a dark-mode toggle to the header",
      description: "A light / dark / system segmented control in the header.",
      status: "done",
      position: 1000,
      createdAt: at(2 * DAY),
      updatedAt: at(2 * DAY - HOUR),
      tags: ["✨ demo", "ux"],
      agentRunId: "run-darkmode",
      agentRunStartedAt: at(2 * DAY),
      agentRunEndedAt: at(2 * DAY - 18340),
      agentResult: "Added a ThemeToggle segmented control wired to useTheme. Typecheck passes.",
      runHistory: [
        run("run-darkmode", "completed", "Add a dark-mode toggle to the header.", {
          startedAt: at(2 * DAY),
          endedAt: at(2 * DAY - 18340),
          exitCode: 0,
          tokens: 12108,
          cost: 0.0421,
          result: "Added a ThemeToggle segmented control wired to useTheme. Typecheck passes.",
        }),
      ],
    },
    {
      ...base,
      id: "demo-deps",
      title: "Bump outdated dependencies",
      description: "Safe (same-major) bumps for zod, sonner and lucide-react.",
      status: "done",
      position: 2000,
      createdAt: at(5 * HOUR),
      updatedAt: at(5 * HOUR - 16450),
      tags: ["✨ demo", "deps"],
      agentRunId: "run-deps",
      agentRunStartedAt: at(5 * HOUR),
      agentRunEndedAt: at(5 * HOUR - 16450),
      agentResult: "Bumped zod, sonner, lucide-react within major. Typecheck passes.",
      runHistory: [
        run("run-deps", "completed", "Check for outdated dependencies and bump the safe ones.", {
          startedAt: at(5 * HOUR),
          endedAt: at(5 * HOUR - 16450),
          exitCode: 0,
          tokens: 9140,
          cost: 0.0337,
          result: "Bumped zod → 3.23.8, sonner → 1.7.1, lucide-react → 0.379.0. Typecheck passes.",
        }),
      ],
    },
    {
      ...base,
      id: "demo-i18n",
      title: "Extract hardcoded strings in the trash zone",
      description: "Move two hardcoded labels to the next-intl catalogs (en + fr).",
      status: "done",
      position: 3000,
      createdAt: at(28 * HOUR),
      updatedAt: at(28 * HOUR - 24600),
      tags: ["✨ demo", "i18n"],
      agentRunId: "run-i18n",
      agentRunStartedAt: at(28 * HOUR),
      agentRunEndedAt: at(28 * HOUR - 24600),
      agentResult: "Extracted two labels into the `trash` namespace with en + fr translations.",
      runHistory: [
        run("run-i18n", "completed", "Extract the hardcoded strings in the trash zone into i18n.", {
          startedAt: at(28 * HOUR),
          endedAt: at(28 * HOUR - 24600),
          exitCode: 0,
          tokens: 14010,
          cost: 0.0455,
          result: "Extracted two labels into the `trash` namespace with en + fr translations.",
        }),
      ],
    },
    {
      ...base,
      id: "demo-readme",
      title: "Update the README badges",
      description: "Correct the version badge and add a downloads badge.",
      status: "done",
      position: 4000,
      createdAt: at(4 * DAY),
      updatedAt: at(4 * DAY - 9000),
      tags: ["✨ demo", "docs"],
      agentRunId: "run-readme",
      agentRunStartedAt: at(4 * DAY),
      agentRunEndedAt: at(4 * DAY - 9000),
      agentResult: "README badges updated; version corrected to v0.6.1.",
      runHistory: [
        run("run-readme", "completed", "Update the README badges to match the current version.", {
          startedAt: at(4 * DAY),
          endedAt: at(4 * DAY - 9000),
          exitCode: 0,
          tokens: 4200,
          cost: 0.0102,
          result: "README badges updated; version corrected to v0.6.1.",
        }),
      ],
    },
    {
      ...base,
      id: "demo-showcase",
      title: "UI Showcase — tous les blocs de conversation",
      description: "Run de démonstration : thinking, markdown complet, diff, erreur, result footer.",
      status: "done",
      position: 6000,
      createdAt: at(1 * HOUR),
      updatedAt: at(1 * HOUR - 34560),
      tags: ["✨ demo", "showcase"],
      agentRunId: "run-showcase",
      agentRunStartedAt: at(1 * HOUR),
      agentRunEndedAt: at(1 * HOUR - 34560),
      agentResult: "Tous les types de blocs exercés. Typecheck passe.",
      runHistory: [
        run("run-showcase", "completed", "Exercer chaque type de bloc dans la vue conversation (thinking, markdown, diff, erreur, result).", {
          startedAt: at(1 * HOUR),
          endedAt: at(1 * HOUR - 34560),
          exitCode: 0,
          tokens: 23240,
          cost: 0.0871,
          result: "Tous les types de blocs exercés. Typecheck passe.",
        }),
      ],
    },
    {
      ...base,
      id: "demo-standup",
      title: "Summarize repo changes since yesterday",
      description: "A standup-ready summary of what moved across the repos.",
      status: "done",
      position: 5000,
      createdAt: at(26 * HOUR),
      updatedAt: at(26 * HOUR - 52000),
      tags: ["✨ demo", "standup"],
      agentRunId: "run-opencode",
      agentRunStartedAt: at(26 * HOUR),
      agentRunEndedAt: at(26 * HOUR - 52000),
      agentResult: "Added PluginInfo protocol-compatibility fields to @myra/shared.",
      runHistory: [
        run("run-opencode", "completed", "Summarize what changed across the repos since yesterday.", {
          startedAt: at(26 * HOUR),
          endedAt: at(26 * HOUR - 52000),
          exitCode: 0,
          tokens: 16800,
          cost: 0.0594,
          result: "Added PluginInfo protocol-compatibility fields to @myra/shared.",
        }),
      ],
    },
  ];
}

/** Demo schedules, seeded when the store is empty so the Schedules page lists
 *  rows in `bun run dev`. `nextRunAt` is offset from now so "Next Run" shows a
 *  live countdown. */
export function demoSchedules(): ScheduledTask[] {
  const now = Date.now();
  const inHours = (h: number) => new Date(now + h * 3600_000).toISOString();
  const createdAt = "2026-06-12T08:00:00.000Z";
  return [
    {
      id: "demo-sched-inbox",
      name: "Inbox triage",
      cardTitle: "Inbox triage",
      cardDescription: "Triage the inbox and surface what needs a reply.",
      agentPrompt: "Triage my inbox: group threads by urgency and draft replies for the ones that need one.",
      tags: ["brief"],
      schedule: { type: "interval", start: "08:00", minutes: 120 },
      enabled: true,
      agentPresetId: "opencode",
      createdAt,
      nextRunAt: inHours(11.5),
    },
    {
      id: "demo-sched-deps",
      name: "Dependency audit",
      cardTitle: "Dependency audit",
      cardDescription: "Check for outdated dependencies and propose safe bumps.",
      agentPrompt: "Check for outdated dependencies, flag the ones safe to bump, and open a summary.",
      tags: ["deps"],
      schedule: { type: "weekly", days: [1, 3, 5], time: "08:00" },
      enabled: true,
      agentPresetId: "opencode",
      useWorktree: true,
      createdAt,
      nextRunAt: inHours(36),
    },
    {
      id: "demo-sched-standup",
      name: "Standup prep",
      cardTitle: "Standup prep",
      cardDescription: "Daily standup talking points, ready before the meeting.",
      agentPrompt: "Prepare my standup notes: yesterday, today, blockers. One line each.",
      tags: ["standup"],
      schedule: { type: "daily", time: "08:45" },
      enabled: true,
      agentPresetId: "opencode",
      createdAt,
      nextRunAt: inHours(20),
    },
    {
      id: "demo-sched-security",
      name: "Security scan",
      cardTitle: "Security scan",
      cardDescription: "Scan changed code for exploitable security issues.",
      agentPrompt:
        "Scan the recently changed code for exploitable security vulnerabilities and report validated findings.",
      tags: ["security"],
      schedule: { type: "daily", time: "07:00" },
      enabled: false,
      agentPresetId: "opencode",
      createdAt,
      nextRunAt: inHours(18),
    },
    {
      id: "demo-sched-review",
      name: "Weekly review",
      cardTitle: "Weekly review",
      cardDescription: "End-of-week board review and stale-card cleanup.",
      agentPrompt: "Review the board: list cards stuck over a week and propose next steps.",
      tags: ["review"],
      schedule: { type: "weekly", days: [1], time: "09:00" },
      enabled: true,
      createdAt,
      nextRunAt: inHours(72),
    },
    {
      id: "demo-sched-pr",
      name: "PR review sweep",
      cardTitle: "PR review sweep",
      cardDescription: "Review open pull requests and flag what needs attention.",
      agentPrompt: "Review open PRs: summarize each, flag concerns, and say which are ready to merge.",
      tags: ["review"],
      schedule: { type: "interval", start: "08:00", minutes: 240 },
      enabled: true,
      agentPresetId: "opencode",
      createdAt,
      nextRunAt: inHours(3.5),
    },
    {
      id: "demo-sched-errors",
      name: "Error digest",
      cardTitle: "Error digest",
      cardDescription: "Daily digest of the top errors with a probable cause.",
      agentPrompt: "Digest the top errors over the last 24h: group by message, show frequency, give a probable cause.",
      tags: ["errors"],
      schedule: { type: "daily", time: "08:30" },
      enabled: true,
      agentPresetId: "opencode",
      createdAt,
      nextRunAt: inHours(19.5),
    },
    {
      id: "demo-sched-tests",
      name: "Nightly test sweep",
      cardTitle: "Nightly test sweep",
      cardDescription: "Run the suite and triage any new failures.",
      agentPrompt: "Run the test suite, list new failures, and propose a fix for each.",
      tags: ["tests"],
      schedule: { type: "daily", time: "02:00" },
      enabled: true,
      agentPresetId: "opencode",
      useWorktree: true,
      createdAt,
      nextRunAt: inHours(8),
    },
    {
      id: "demo-sched-triage",
      name: "Incident triage",
      cardTitle: "Incident triage",
      cardDescription: "Triage new incidents and propose an owner.",
      agentPrompt: "Check for new incidents since the last run; summarize cause, propose an owner and first step.",
      tags: ["triage"],
      schedule: { type: "interval", start: "00:00", minutes: 30 },
      enabled: true,
      createdAt,
      nextRunAt: inHours(0.5),
    },
    {
      id: "demo-sched-research",
      name: "Competitor watch",
      cardTitle: "Competitor watch",
      cardDescription: "Weekly summary of competitor releases and pricing.",
      agentPrompt: "Summarize competitor activity this week: releases, pricing, announcements. Group by competitor.",
      tags: ["research"],
      schedule: { type: "weekly", days: [1], time: "09:30" },
      enabled: false,
      agentPresetId: "opencode",
      createdAt,
      nextRunAt: inHours(96),
    },
    {
      id: "demo-sched-release",
      name: "Changelog draft",
      cardTitle: "Changelog draft",
      cardDescription: "Draft the release changelog from merged PRs.",
      agentPrompt: "Draft a changelog from PRs merged since the last release, grouped by type.",
      tags: ["release"],
      schedule: { type: "weekly", days: [5], time: "17:00" },
      enabled: true,
      agentPresetId: "opencode",
      createdAt,
      nextRunAt: inHours(50),
    },
  ];
}
