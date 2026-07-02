# Manual QA — Agents & runs

Manual validation checklist for the "Agents & runs" features. No automated test suite exists; this is the smoke-test contract.

Run with `bun run tauri:dev` (a real agent binary on PATH: opencode / copilot / claude) for full coverage, or `bun run tauri:demo` for UI-only / seeded data.

## Prerequisites

- At least one valid agent preset in Settings (binary on PATH, `argsTemplate` contains `{prompt}`).

## 1. Per-task agent selection

- [ ] Card → modal: "Agent preset" dropdown present, defaults to the app default agent.
- [ ] Change preset → save → reopen: persists.
- [ ] Agent badge visible on the board card.
- [ ] Board "agent" filter narrows correctly.

## 2. Configurable agent command (Settings)

- [ ] Add / edit / remove preset: name, binary, argsTemplate, **workingDir** (new field).
- [ ] Save → reload app → presets + workingDir persist.
- [ ] `argsTemplate` without `{prompt}` → launch errors.

## 3. Per-card working directory

- [ ] Card modal: "Working directory" field.
- [ ] Launch with a valid dir → agent runs inside it.
- [ ] Nonexistent dir → launch fails with `Working directory does not exist: …` (no opaque crash).
- [ ] Empty → fallback (card → preset → home).
- [ ] Folder button opens the directory.

## 4. Run queue (concurrency)

- [ ] Settings: `maxConcurrentAgents` = 1.
- [ ] Launch 3 cards quickly → 1 In Progress, 2 show **Queued** badge (amber).
- [ ] When one finishes → next queued card starts automatically.
- [ ] `maxConcurrentAgents` = 0 → all start immediately, never queued.
- [ ] Cancel a queued card → leaves the queue, badge disappears.

## 5. Relaunch / retry

- [ ] Finished card (done / review / failed) → modal: **Relaunch** button.
- [ ] Relaunch → card goes back to In Progress.
- [ ] Card with revision notes → relaunch → notes included in the prompt (check run log / prompt).
- [ ] In Progress or Queued card → Relaunch button absent.

## 6. Run artifacts (Logs)

- [ ] Logs page → open a run → file list (log + archived results); button opens the file.
- [ ] "Open working dir" button opens the folder.

## 7. Cost / duration stats

- [ ] Agent writes `tokens` / `cost` into `~/.myra-agents/agent-results/{cardId}.json` → Logs detail shows duration + tokens + cost.
- [ ] Card modal (≥1 run): aggregate block **runs / total time / total cost**.
- [ ] Demo mode: done / review cards already show seeded tokens + cost.

## Result protocol (agent contract)

Agent writes `~/.myra-agents/agent-results/{cardId}.json`:

- [ ] `status: awaiting_review` + `result` → card → Review.
- [ ] `status: waiting_feedback` + `question` → card → Feedback.
- [ ] `status: failed` + `error` → card → Todo, error visible.
- [ ] Optional `tokens` / `cost` recorded on the run.

## Verification gates (before merge)

- [ ] `npx tsc --noEmit`
- [ ] `cd src-tauri && cargo check`
- [ ] `npx biome check`
- [ ] Manual smoke test above.

## Notes

- `trigger_schedule_now` (a schedule's "Run Now") intentionally bypasses the queue — immediate launch.
