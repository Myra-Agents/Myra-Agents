// The conversation transcript model is a CONTRACT and now lives in
// `@myra/shared` (`types/conversation.ts`) so the harness event → transcript
// mapping (`harnessEventToEntry`) is shared between this front-end and the
// worker-side NDJSON replay. This module re-exports it to keep the historical
// `@/lib/conversation/types` import path working across the app.

export type {
  ResultEntry,
  TextEntry,
  ThinkingEntry,
  ToolResultEntry,
  ToolUseEntry,
  Transcript,
  TranscriptEntry,
  UserEntry,
} from "@myra/shared";
