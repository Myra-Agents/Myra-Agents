"use client";

// Claude-style rendering of an agent run: the human prompt, the agent's prose
// and reasoning, every tool call paired with its output, and a final usage
// footer. Driven by a parsed `Transcript` (see `lib/conversation/parse.ts`).

import { useEffect, useMemo, useState } from "react";

import {
  BrainIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  ClockIcon,
  CoinsIcon,
  FileEditIcon,
  FileSearchIcon,
  FolderSearchIcon,
  GlobeIcon,
  ListChecksIcon,
  type LucideIcon,
  SparklesIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MyraLoader } from "@/components/ui/myra-loader";
import type { ToolResultEntry, ToolUseEntry, Transcript, TranscriptEntry } from "@/lib/conversation/types";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { CopyButton } from "./copy-button";
import { DiffView, looksLikeDiff } from "./diff-view";
import { Markdown } from "./markdown";

const TOOL_ICONS: Record<string, LucideIcon> = {
  read: FileSearchIcon,
  edit: FileEditIcon,
  write: FileEditIcon,
  multiedit: FileEditIcon,
  bash: TerminalIcon,
  glob: FolderSearchIcon,
  grep: FolderSearchIcon,
  webfetch: GlobeIcon,
  websearch: GlobeIcon,
  todowrite: ListChecksIcon,
  task: SparklesIcon,
};

function toolIcon(name: string): LucideIcon {
  return TOOL_ICONS[name.toLowerCase()] ?? WrenchIcon;
}

/** One-line summary of the tool's most salient argument (path / command / …). */
function toolArgSummary(tool: ToolUseEntry): string {
  const i = tool.input;
  const pick = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : undefined);
  return (
    pick("file_path") ??
    pick("path") ??
    pick("command") ??
    pick("pattern") ??
    pick("query") ??
    pick("url") ??
    pick("description") ??
    ""
  );
}

export function ConversationView({ transcript, thinking }: { transcript: Transcript; thinking?: boolean }) {
  // Pair tool results to their calls so a result renders under its tool_use.
  const resultsByToolId = useMemo(() => {
    const map = new Map<string, ToolResultEntry>();
    for (const e of transcript.entries) {
      if (e.kind === "tool_result" && e.toolUseId) map.set(e.toolUseId, e);
    }
    return map;
  }, [transcript.entries]);

  const consumed = new Set<string>();
  for (const e of transcript.entries) {
    if (e.kind === "tool_use" && e.id && resultsByToolId.has(e.id)) consumed.add(e.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-8">
      {transcript.entries.map((entry, i) => {
        // Skip tool_result entries already rendered beneath their tool_use.
        if (entry.kind === "tool_result" && entry.toolUseId && consumed.has(entry.toolUseId)) return null;
        return (
          <EntryRow
            key={i}
            entry={entry}
            result={entry.kind === "tool_use" ? resultsByToolId.get(entry.id) : undefined}
          />
        );
      })}
      {thinking && <ThinkingIndicator />}
    </div>
  );
}

/** Animated "agent is working" indicator — the animated Myra mark (shimmer) next
 * to a rotating playful status message (Claude-Code style). Rendered at the tail
 * of the transcript while the run is live. */
function ThinkingIndicator() {
  const t = useTranslations("logs.conversation");
  const loaderVariant = usePreferencesStore((s) => s.loaderVariant);
  // Pull the funny message pool from i18n; fall back to the single "working" line.
  const messages = useMemo(() => {
    const raw = t.raw("workingMessages");
    return Array.isArray(raw) && raw.length > 0 ? (raw as string[]) : [t("working")];
  }, [t]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => {
      // Hop to a different random message so it never repeats back-to-back.
      setIdx((i) => {
        let n = i;
        while (n === i) n = Math.floor(Math.random() * messages.length);
        return n;
      });
    }, 7000);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs" aria-live="polite">
      <MyraLoader size={16} variant={loaderVariant} className="shrink-0 text-primary" />
      <span key={messages[idx]} className="fade-in animate-in duration-500">
        {messages[idx]}
      </span>
    </div>
  );
}

function EntryRow({ entry, result }: { entry: TranscriptEntry; result?: ToolResultEntry }) {
  switch (entry.kind) {
    case "user":
      return <UserBubble text={entry.text} />;
    case "text":
      return <AssistantBlock>{<Markdown text={entry.text} />}</AssistantBlock>;
    case "thinking":
      return <ThinkingBlock text={entry.text} />;
    case "tool_use":
      return <ToolCall tool={entry} result={result} />;
    case "tool_result":
      // Orphan result (no matching call) — render standalone.
      return <ToolResultBlock result={entry} />;
    case "result":
      return <ResultFooter entry={entry} />;
    default:
      return null;
  }
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/10 px-4 py-2.5 text-foreground text-sm">
        <Markdown text={text} />
      </div>
    </div>
  );
}

function AssistantBlock({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

function ThinkingBlock({ text }: { text: string }) {
  const t = useTranslations("logs.conversation");
  return (
    <div>
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground">
          <BrainIcon className="size-3.5" />
          <span>{t("thinking")}</span>
          <ChevronRightIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 border-muted border-l-2 py-1 pl-3 text-muted-foreground text-xs italic">
            <Markdown text={text} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Input keys already surfaced in the collapsed header row — redundant to repeat.
const SUMMARY_KEYS = new Set(["file_path", "path", "command", "pattern", "query", "url", "description"]);

function ToolCall({ tool, result }: { tool: ToolUseEntry; result?: ToolResultEntry }) {
  const Icon = toolIcon(tool.name);
  const arg = toolArgSummary(tool);
  const inputJson = JSON.stringify(tool.input, null, 2);
  const hasOutput = !!result?.content?.trim();
  const outputIsDiff = hasOutput && !!result && looksLikeDiff(result.content);
  // Show the input block only when it carries more than the header already does.
  const richInput = Object.keys(tool.input).some((k) => !SUMMARY_KEYS.has(k));
  const showInput = richInput || !hasOutput;

  return (
    <div>
      <Collapsible>
        <CollapsibleTrigger
          className={cn(
            "group flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50",
            result?.isError ? "border-destructive/40 bg-destructive/5" : "border-border",
          )}
        >
          <Icon className={cn("size-3.5 shrink-0", result?.isError ? "text-destructive" : "text-muted-foreground")} />
          <span className="font-medium">{tool.name}</span>
          {arg && <span className="truncate font-mono text-muted-foreground">{arg}</span>}
          <ChevronRightIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 space-y-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
            {showInput && <ToolIO label="input" body={inputJson} mono />}
            {hasOutput &&
              result &&
              (outputIsDiff ? (
                <DiffView diff={result.content} />
              ) : (
                <ToolIO label="output" body={result.content} mono isError={result.isError} />
              ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ToolResultBlock({ result }: { result: ToolResultEntry }) {
  return (
    <div>
      <ToolIO label="output" body={result.content} mono isError={result.isError} />
    </div>
  );
}

function ToolIO({
  label,
  body,
  mono,
  isError,
}: {
  label: "input" | "output";
  body: string;
  mono?: boolean;
  isError?: boolean;
}) {
  const t = useTranslations("logs.conversation");
  const MAX = 1600;
  const [expanded, setExpanded] = useState(false);
  const truncated = body.length > MAX && !expanded;
  const shown = truncated ? body.slice(0, MAX) : body;
  return (
    <div className="group/io relative">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">{t(label)}</span>
        <CopyButton value={body} className="opacity-0 group-hover/io:opacity-100" />
      </div>
      <pre
        className={cn(
          "overflow-x-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-[11px] leading-relaxed",
          mono && "font-mono",
          isError && "text-destructive",
        )}
      >
        {shown}
        {truncated && "…"}
      </pre>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-[11px] text-primary hover:underline"
        >
          {t("showMore", { count: body.length - MAX })}
        </button>
      )}
    </div>
  );
}

function ResultFooter({ entry }: { entry: Extract<TranscriptEntry, { kind: "result" }> }) {
  const t = useTranslations("logs.conversation");
  return (
    <div className="flex flex-col gap-2">
      {entry.summary.trim() && (
        <div
          className={cn(
            "rounded-md border-l-2 py-1 pl-3 text-sm",
            entry.isError ? "border-destructive text-destructive" : "border-primary/40 text-foreground",
          )}
        >
          <Markdown text={entry.summary} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {typeof entry.tokens === "number" && (
          <span className="inline-flex items-center gap-1">
            <CoinsIcon className="size-3" />
            {entry.tokens.toLocaleString()} {t("tokens")}
          </span>
        )}
        {typeof entry.cost === "number" && (
          <span className="inline-flex items-center gap-1">
            <CircleDollarSignIcon className="size-3" />${entry.cost.toFixed(4)}
          </span>
        )}
        {typeof entry.durationMs === "number" && (
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3" />
            {(entry.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        {typeof entry.numTurns === "number" && <span>{t("turns", { count: entry.numTurns })}</span>}
      </div>
    </div>
  );
}
