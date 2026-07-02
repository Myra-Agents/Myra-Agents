"use client";

// Tiny dependency-free markdown renderer for agent conversation text. Handles
// the subset coding agents actually emit: fenced code blocks, inline code,
// bold (may wrap code), headings, bullet/numbered lists, and GFM tables. Not a
// full CommonMark parser — by design, to avoid pulling react-markdown + remark
// into the bundle.

import { Fragment, type ReactNode } from "react";

import { CopyButton } from "./copy-button";

/** Inline code spans inside a run of (non-bold) text. */
function renderCode(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(`[^`]+`)/g).forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      out.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part) {
      out.push(<Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>);
    }
  });
  return out;
}

/** Inline spans: **bold** (may wrap `code`), then `code`. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on bold first so **…** spanning an inline-code chunk stays intact.
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 2) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
          {renderCode(part.slice(2, -2), `${keyPrefix}-b${i}`)}
        </strong>,
      );
    } else if (part) {
      nodes.push(...renderCode(part, `${keyPrefix}-s${i}`));
    }
  });
  return nodes;
}

interface Segment {
  type: "code" | "text";
  lang?: string;
  content: string;
}

/** Split markdown into fenced-code and text segments. */
function segment(md: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null = fence.exec(md);
  while (m !== null) {
    if (m.index > last) segments.push({ type: "text", content: md.slice(last, m.index) });
    segments.push({ type: "code", lang: m[1] || undefined, content: m[2].replace(/\n$/, "") });
    last = fence.lastIndex;
    m = fence.exec(md);
  }
  if (last < md.length) segments.push({ type: "text", content: md.slice(last) });
  return segments;
}

/** Render a text segment as paragraphs / headings / lists. */
function renderText(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items;
    const ordered = list.ordered;
    out.push(
      ordered ? (
        <ol key={`${keyPrefix}-ol${out.length}`} className="my-1 ml-5 list-decimal space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it, `${keyPrefix}-oli${i}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`${keyPrefix}-ul${out.length}`} className="my-1 ml-5 list-disc space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it, `${keyPrefix}-uli${i}`)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };

  // GFM table helpers: a header row, a `|---|---|` separator, then body rows.
  const isRow = (l: string) => l.includes("|") && l.trim() !== "";
  const isSep = (l: string) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-");
  const splitRow = (l: string) => {
    let s = l.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map((c) => c.trim());
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Table: a pipe row immediately followed by a separator row.
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      flushList();
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isRow(lines[j]) && !isSep(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      out.push(
        <div key={`${keyPrefix}-tw${i}`} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th key={ci} className="border border-border bg-muted/40 px-2 py-1 text-left font-semibold">
                    {renderInline(c, `${keyPrefix}-th${i}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td key={ci} className="border border-border px-2 py-1 align-top">
                      {renderInline(r[ci] ?? "", `${keyPrefix}-td${i}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = j;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      i++;
      continue;
    }
    if (numbered) {
      if (!list?.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      i++;
      continue;
    }
    flushList();

    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-sm font-medium";
      out.push(
        <p key={`${keyPrefix}-h${i}`} className={`mt-2 mb-1 ${cls}`}>
          {renderInline(heading[2], `${keyPrefix}-hi${i}`)}
        </p>,
      );
      i++;
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    out.push(
      <p key={`${keyPrefix}-p${i}`} className="my-1 leading-relaxed">
        {renderInline(line, `${keyPrefix}-pi${i}`)}
      </p>,
    );
    i++;
  }
  flushList();
  return out;
}

export function Markdown({ text }: { text: string }) {
  const segments = segment(text);
  return (
    <div className="text-foreground text-sm">
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <div key={`seg${i}`} className="group/code relative my-2">
            {seg.lang && (
              <span className="absolute top-2 left-3 text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {seg.lang}
              </span>
            )}
            <CopyButton value={seg.content} className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100" />
            <pre className="overflow-x-auto rounded-md bg-muted/70 p-3 pt-7 font-mono text-xs leading-relaxed">
              <code>{seg.content}</code>
            </pre>
          </div>
        ) : (
          <Fragment key={`seg${i}`}>{renderText(seg.content, `seg${i}`)}</Fragment>
        ),
      )}
    </div>
  );
}
