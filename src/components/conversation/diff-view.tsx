"use client";

// Render a unified diff (the output of Edit / Write / MultiEdit tools) the way
// Claude does: file/index headers stripped, hunk ranges as a faint separator,
// added lines green, removed lines red, context muted — with a +/−/space gutter.

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

/** Does this tool output look like a unified diff worth rendering as one? */
export function looksLikeDiff(s: string): boolean {
  return /^@@.+@@/m.test(s) || /^Index: /m.test(s) || (/^\+\+\+ /m.test(s) && /^--- /m.test(s));
}

type RowType = "add" | "del" | "ctx" | "hunk";
interface Row {
  type: RowType;
  text: string;
}

function parseDiff(diff: string): Row[] {
  const rows: Row[] = [];
  for (const line of diff.split("\n")) {
    // Drop the file/index headers — the tool row already names the file.
    if (/^Index: /.test(line) || /^={3,}$/.test(line) || /^--- /.test(line) || /^\+{3} /.test(line)) continue;
    if (/^@@.*@@/.test(line)) {
      rows.push({ type: "hunk", text: line });
    } else if (line.startsWith("+")) {
      rows.push({ type: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      rows.push({ type: "del", text: line.slice(1) });
    } else {
      rows.push({ type: "ctx", text: line.replace(/^ /, "") });
    }
  }
  // Trim leading/trailing blank context lines.
  while (rows.length && rows[0].type === "ctx" && !rows[0].text.trim()) rows.shift();
  while (rows.length && rows[rows.length - 1].type === "ctx" && !rows[rows.length - 1].text.trim()) rows.pop();
  return rows;
}

const SIGN: Record<RowType, string> = { add: "+", del: "−", ctx: " ", hunk: "" };

export function DiffView({ diff }: { diff: string }) {
  const t = useTranslations("logs.conversation");
  const rows = parseDiff(diff);
  return (
    <div className="group/io relative">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
          {t("changes")}
        </span>
        <CopyButton value={diff} className="opacity-0 group-hover/io:opacity-100" />
      </div>
      <div className="overflow-x-auto rounded bg-background/60 py-1 font-mono text-[11px] leading-relaxed">
        {rows.map((row, i) =>
          row.type === "hunk" ? (
            <div key={i} className="select-none px-2 py-1 text-[10px] text-muted-foreground/60">
              {row.text}
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                "flex whitespace-pre",
                row.type === "add" && "bg-green-500/10 text-green-700 dark:text-green-300",
                row.type === "del" && "bg-red-500/10 text-red-700 dark:text-red-300",
              )}
            >
              <span
                className={cn(
                  "w-5 shrink-0 select-none text-center",
                  row.type === "add"
                    ? "text-green-600/70"
                    : row.type === "del"
                      ? "text-red-600/70"
                      : "text-transparent",
                )}
              >
                {SIGN[row.type]}
              </span>
              <span className="flex-1 break-words pr-2">{row.text || " "}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
