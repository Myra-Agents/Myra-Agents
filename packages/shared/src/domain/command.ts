/**
 * Agent command-line construction. A direct port of the Rust backend's
 * `quote_windows_arg` / `split_command_line` / `build_agent_command`
 * (`src-tauri/src/commands/agent.rs`). Kept here in `@myra/shared` so the
 * Node server runner and any future executor share the exact same
 * argument-template semantics the desktop app shipped with.
 *
 * The template is rendered by substituting `{prompt}` with a quoted form of
 * the prompt, then split into argv with the same backslash/quote rules the
 * Rust implementation used. The result is `{ binary, args }`, ready to hand to
 * a process spawner.
 */

/** Quote a single argument the way the Rust `quote_windows_arg` did. */
export function quoteArg(arg: string): string {
  if (arg.length === 0) return '""';

  const needsQuotes = /[\s"]/.test(arg);
  if (!needsQuotes) return arg;

  let quoted = '"';
  let backslashes = 0;
  for (const ch of arg) {
    if (ch === "\\") {
      backslashes += 1;
    } else if (ch === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += '"';
      backslashes = 0;
    } else {
      quoted += "\\".repeat(backslashes);
      quoted += ch;
      backslashes = 0;
    }
  }
  quoted += "\\".repeat(backslashes * 2);
  quoted += '"';
  return quoted;
}

/**
 * Split a rendered command line into argv. Mirrors the Rust
 * `split_command_line` (MSVC-style backslash/quote handling). Throws on an
 * unmatched quote.
 */
export function splitCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let backslashes = 0;
  let hadToken = false;

  const chars = Array.from(input);
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === "\\") {
      backslashes += 1;
    } else if (ch === '"') {
      hadToken = true;
      current += "\\".repeat(Math.floor(backslashes / 2));
      if (backslashes % 2 === 0) {
        if (inQuotes && chars[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else {
        current += '"';
      }
      backslashes = 0;
    } else if (/\s/.test(ch) && !inQuotes) {
      current += "\\".repeat(backslashes);
      backslashes = 0;
      if (hadToken || current.length > 0) {
        args.push(current);
        current = "";
        hadToken = false;
      }
    } else {
      current += "\\".repeat(backslashes);
      backslashes = 0;
      current += ch;
      hadToken = true;
    }
  }

  if (inQuotes) {
    throw new Error("Invalid argsTemplate: unmatched quote");
  }

  current += "\\".repeat(backslashes);
  if (hadToken || current.length > 0) {
    args.push(current);
  }
  return args;
}

export interface AgentCommandLine {
  binary: string;
  args: string[];
}

/**
 * Build the `{ binary, args }` to spawn from a preset's `binary` +
 * `argsTemplate` and the rendered prompt. The template must contain
 * `{prompt}` (validated, mirroring the Rust check).
 */
export function buildAgentCommand(binary: string, argsTemplate: string, prompt: string): AgentCommandLine {
  const trimmed = binary.trim();
  if (trimmed.length === 0) {
    throw new Error("Agent binary cannot be empty");
  }
  if (!argsTemplate.includes("{prompt}")) {
    throw new Error(`Agent preset \`${trimmed}\` must include {prompt} in argsTemplate`);
  }

  const rendered = argsTemplate.split("{prompt}").join(quoteArg(prompt));
  const args = splitCommandLine(rendered);
  return { binary: trimmed, args };
}
