// Skill types + curated marketplace catalog + prompt-composition helpers.
//
// A "skill" is a named, reusable block of agent instructions (markdown). Unlike
// the schedule/card agent-config fields, skills are NOT mirrored by the Rust
// sidecar — they live entirely on the client (localStorage, see
// `@/hooks/use-skills`) and are *invoked* by composing their content into the
// agent prompt. That keeps the feature self-contained: the composed prompt is a
// plain string the sidecar already persists and materializes onto every card a
// patrol fires, so the running agent receives the skill guidance verbatim with
// no backend change.
//
// This mirrors the local-only precedent set by `@/types/planner` — a first-class
// app model that has no shared/Rust counterpart.

/** A user-managed skill: reusable agent instructions invoked from patrols. */
export interface Skill {
  id: string;
  name: string;
  /** One-line summary shown in lists and pickers. */
  description: string;
  /** Markdown instructions injected into the agent prompt when invoked. */
  content: string;
  /** Optional grouping label (e.g. "Testing", "Review"). */
  category?: string;
  /** Where the skill came from: hand-authored or installed from the marketplace. */
  source: "custom" | "marketplace";
  /** Marketplace entry id when installed — used to dedupe re-installs. */
  marketplaceId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields the skill editor collects; id/timestamps/source are filled in on save. */
export type SkillInput = Pick<Skill, "name" | "description" | "content" | "category">;

/** One entry in the curated skill marketplace (a static, bundled catalog). */
export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  /** Emoji shown on the marketplace card. */
  icon: string;
  /** Markdown instructions copied into the user's library on install. */
  content: string;
  tags: string[];
}

export function createSkillId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `skill-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Build a library {@link Skill} from a marketplace entry. */
export function skillFromMarketplace(entry: MarketplaceSkill, now = new Date().toISOString()): Skill {
  return {
    id: createSkillId(),
    name: entry.name,
    description: entry.description,
    content: entry.content,
    category: entry.category,
    source: "marketplace",
    marketplaceId: entry.id,
    createdAt: now,
    updatedAt: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt composition — how skills are "invoked" on a patrol.
//
// Attached skills are folded into the schedule's `agentPrompt` inside a fenced,
// machine-readable block. The block is hidden from the instruction textarea (the
// editor shows only the base prompt) but rides along in the persisted prompt, so
// the agent that the patrol fires actually receives the skill guidance. The
// per-skill marker lets us recover exactly which skills are attached when the
// editor re-opens — no extra field on the (Rust-mirrored) schedule model.
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_START = "<!-- myra:skills:start -->";
const BLOCK_END = "<!-- myra:skills:end -->";
const SKILL_MARKER = /<!--\s*myra:skill:([^\s]+)\s*-->/g;

/** Remove any of our own markers from user/marketplace content (defensive). */
function stripMarkers(text: string): string {
  return text.split(BLOCK_START).join("").split(BLOCK_END).join("").replace(SKILL_MARKER, "").trimEnd();
}

/**
 * Fold `skills` into `basePrompt`, returning the prompt the patrol persists. With
 * no skills the base prompt is returned unchanged (no block).
 */
export function composeAgentPrompt(basePrompt: string, skills: Skill[]): string {
  const base = basePrompt.replace(/\s+$/, "");
  if (skills.length === 0) return base;
  const sections = skills.map((skill) => {
    const content = stripMarkers(skill.content).trim();
    return `### ${skill.name}\n<!-- myra:skill:${skill.id} -->\n\n${content}`;
  });
  const block = [
    BLOCK_START,
    "## Skills",
    "",
    "Apply the following skills to this task wherever they are relevant.",
    "",
    sections.join("\n\n"),
    BLOCK_END,
  ].join("\n");
  return base ? `${base}\n\n${block}` : block;
}

/**
 * Inverse of {@link composeAgentPrompt}: split a persisted prompt back into its
 * base instruction and the ids of the skills attached to it. A prompt with no
 * skills block round-trips as `{ basePrompt: prompt, skillIds: [] }`.
 */
export function parseAgentPrompt(prompt: string): { basePrompt: string; skillIds: string[] } {
  const start = prompt.indexOf(BLOCK_START);
  if (start === -1) return { basePrompt: prompt, skillIds: [] };
  const endMarker = prompt.indexOf(BLOCK_END, start);
  const block = endMarker === -1 ? prompt.slice(start) : prompt.slice(start, endMarker + BLOCK_END.length);
  const basePrompt = prompt.slice(0, start).replace(/\s+$/, "");
  const skillIds: string[] = [];
  for (const match of block.matchAll(SKILL_MARKER)) skillIds.push(match[1]);
  return { basePrompt, skillIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Curated marketplace catalog. Static + bundled for now (the UI also lets users
// author their own). Kept intentionally small and coding-agent focused.
// ─────────────────────────────────────────────────────────────────────────────

export const SKILL_MARKETPLACE: MarketplaceSkill[] = [
  {
    id: "mk-conventional-commits",
    name: "Conventional Commits",
    description: "Write commits that follow the Conventional Commits spec.",
    category: "Git",
    author: "Myra",
    icon: "📝",
    tags: ["git", "commits"],
    content: [
      "When committing, follow the Conventional Commits specification:",
      "",
      "- Use a `type(scope): subject` header (types: feat, fix, chore, docs, refactor, test, perf, build, ci).",
      "- Keep the subject in the imperative mood and under 72 characters.",
      "- Add a body only when it clarifies the *why*; wrap it at 72 columns.",
      "- One logical change per commit — split unrelated edits.",
    ].join("\n"),
  },
  {
    id: "mk-test-first",
    name: "Test-Driven Changes",
    description: "Add or update tests alongside every behavioural change.",
    category: "Testing",
    author: "Myra",
    icon: "🧪",
    tags: ["testing", "quality"],
    content: [
      "For any change that alters behaviour:",
      "",
      "1. Identify the existing test suite and how it is run.",
      "2. Add a failing test that captures the new behaviour before implementing it.",
      "3. Implement the change until the test passes.",
      "4. Run the full suite and report the results — never claim done on an unrun suite.",
      "5. Cover edge cases: empty input, boundaries, and error paths.",
    ].join("\n"),
  },
  {
    id: "mk-self-review",
    name: "Self Code Review",
    description: "Review your own diff for correctness before finishing.",
    category: "Review",
    author: "Myra",
    icon: "🔍",
    tags: ["review", "quality"],
    content: [
      "Before declaring the task complete, review your own diff:",
      "",
      "- Re-read every changed hunk and confirm it does what the task asked.",
      "- Check for off-by-one errors, unhandled nulls, and swapped arguments.",
      "- Ensure new code matches the surrounding style, naming, and error handling.",
      "- Remove debug logging, commented-out code, and stray TODOs you introduced.",
      "- Confirm the change type-checks / lints / builds where those gates exist.",
    ].join("\n"),
  },
  {
    id: "mk-security-audit",
    name: "Security Hardening",
    description: "Watch for common security pitfalls while editing.",
    category: "Security",
    author: "Myra",
    icon: "🛡️",
    tags: ["security"],
    content: [
      "Apply defensive-security judgement to every change:",
      "",
      "- Never log or hard-code secrets, tokens, or credentials.",
      "- Validate and sanitise all external input before use.",
      "- Use parameterised queries; never build SQL by string concatenation.",
      "- Avoid `eval`, shell interpolation of untrusted data, and unsafe deserialisation.",
      "- Prefer least-privilege defaults and fail closed on error.",
    ].join("\n"),
  },
  {
    id: "mk-docs-sync",
    name: "Keep Docs in Sync",
    description: "Update documentation when behaviour changes.",
    category: "Docs",
    author: "Myra",
    icon: "📚",
    tags: ["docs"],
    content: [
      "When a change affects observable behaviour, keep docs in sync:",
      "",
      "- Update the README, inline doc comments, and any user-facing help text.",
      "- Refresh code examples so they still run against the new API.",
      "- Note breaking changes in the changelog if the repo keeps one.",
    ].join("\n"),
  },
  {
    id: "mk-minimal-diff",
    name: "Minimal Diff",
    description: "Make the smallest change that solves the problem.",
    category: "Refactor",
    author: "Myra",
    icon: "✂️",
    tags: ["refactor", "quality"],
    content: [
      "Favour the smallest correct change:",
      "",
      "- Touch only what the task requires — resist unrelated refactors.",
      "- Match existing patterns instead of introducing new abstractions.",
      "- Do not reformat untouched lines or churn imports needlessly.",
      "- If a larger refactor is warranted, call it out rather than doing it silently.",
    ].join("\n"),
  },
];
