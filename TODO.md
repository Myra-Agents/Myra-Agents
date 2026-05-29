# Myra Agents Kanban — feature backlog

Living list of ideas. Reorder, strike through, or delete as you go.  
Status: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Remote companion (phone / tablet)

Inspired by [mobslide](https://github.com/thewh1teagle/mobslide): scan a QR, no app install on the phone, control the desktop session from the browser.

- [ ] **Pairing flow** — Desktop shows QR + short pairing code; phone opens a local URL (LAN or WebRTC relay). Session expires when closed or after idle timeout.
- [ ] **Remote board view** — Read-only kanban on phone: columns, card titles, status badges, “agent running” indicator.
- [ ] **Remote actions** — From phone: move card (allowed transitions only), launch agent (drop to Todo), cancel run, answer feedback question, approve review / send revision note, open trash restore.
- [ ] **Live log tail** — Stream agent stdout for the active card (SSE or WebSocket from desktop).
- [ ] **Push-style alerts** — Notify phone when agent needs feedback, hits review, or fails (browser notification if permitted).
- [ ] **Security** — Pairing token, optional PIN, bind to local network only; document threat model (same Wi‑Fi trust).

---

## Agents & runs

- [x] **Per-task agent selection** — Pick which agent to run on each card (and schedule): named preset, CLI binary, model/profile, or extra args. Store on the card; show a badge in the board; fall back to app default when unset.
- [x] **Configurable agent command** — Settings for binary, args, default `working_dir`, model/profile (not hard-coded `opencode`); define presets used by per-task selection.
- [x] **Per-card working directory** — Persist and show in card modal; validate path exists before launch.
- [x] **Run queue** — Max concurrent agents (`maxConcurrentAgents` setting, 0 = unlimited); queues launches when limit reached, dequeues on agent exit.
- [x] **Retry / resume** — One-click relaunch from card modal; revision notes are carried into the new run (continue-from-last).
- [x] **Run artifacts** — Run logs + archived results listed in the logs detail view; open file / working dir buttons.
- [x] **Cost / duration stats** — Per run: duration, tokens, cost (`tokens`/`cost` in result protocol). Per card: aggregate runs/time/cost in the card modal.

---

## Kanban & cards

- [~] **Search** — Global search bar: match card title, description, agent prompt, tags, revision notes; highlight hits; keyboard shortcut to focus.
- [~] **Filter tiles** — Narrow visible cards without deleting them: by column/status, tag (multi-select), agent preset, date range, “active agent”, “needs feedback/review”, today-only (extend current toggle). Show filter chips + clear all; persist last filters in session or settings.
- [x] **Search + filter together** — Apply text search on top of active filters; show empty-state when no tiles match.
- [x] **Tags UX** — Autocomplete, color chips, filter bar (feeds tag filter above).
- [x] **Card templates** — Save description + prompt + tags + default agent as reusable template.
- [x] **Bulk operations** — Multi-select: move, trash, tag, launch.
- [x] **Columns customization** — Hide/show columns, rename labels (i18n-friendly).
- [~] **Export / import** — `board.json` backup, merge boards, export run history as markdown.

---

## Schedules & planning

- [ ] **Ticket → tâche répétitive** — Depuis n’importe quelle carte, quel que soit son statut (draft, todo, en cours, review, done, etc.) : action « Rendre récurrent » ouvre l’éditeur de planning pré-rempli (titre, description, prompt, agent, tags, cron/daily/…). Option : lier le schedule à la carte d’origine (`linked_task_id`) sans changer son statut actuel.
- [ ] **Missed run handling** — Catch-up once, skip, or run N times after downtime.
- [ ] **Schedule notifications** — OS toast when a scheduled agent starts or finishes.
- [ ] **Planifier enhancements** — Drag timeline blocks to reschedule; conflict warnings.
- [ ] **Calendar sync** — Optional export to ICS or read busy blocks (out of scope until API chosen).

---

## Desktop app & UX

- [ ] **System tray** — Minimize to tray; badge when feedback/review needed.
- [x] **Global shortcuts** — New card (Mod+N), focus search (Mod+F), cancel open card's agent (Mod+.).
- [ ] **Themes** — Light/dark/system; respect OS accent.
- [ ] **Onboarding** — First-run: pick `~/.myra-agents` location, test agent CLI, sample card.
- [x] **Undo trash** — Toast with “Undo” after soft delete (single + bulk; restores to previous status).
- [ ] **Accessibility** — Keyboard drag-and-drop alternative, focus traps in modals.

---

## Platform & reliability

- [ ] **Linux support** — CI build; note any WebRTC/Tauri gaps (cf. mobslide Linux caveat).
- [ ] **Auto-update** — Tauri updater + release channel.
- [ ] **Structured logging** — Rotating log file for scheduler, watcher, agent spawn errors.
- [ ] **Health panel** — Watcher alive, scheduler tick, disk space under `.myra-agents`.
- [ ] **Multi-machine sync** — Optional sync of `board.json` / schedules (git, cloud drive, or custom — TBD).

---

## Integrations

- [ ] **Myra Agents core API** — If/when a shared service exists: link `linked_task_id`, sync status both ways.
- [ ] **Webhook on terminal states** — `done`, `failed`, `waiting_feedback` → HTTP POST with card payload.
- [ ] **Open in editor** — Button to open `working_dir` in VS Code / Cursor from card.
- [ ] **CLI** — `myra-agents-kanban add-card`, `trigger-schedule`, `list-running` for scripts.

---

## Nice-to-have / experiments

- [ ] **Voice note → card** — Transcribe quick capture into Draft.
- [ ] **Screenshot attach** — Paste image into card description (store under `.myra-agents/attachments/`).
- [ ] **Board snapshots** — Daily automatic backup with retention.
- [ ] **Plugins** — Hook after agent completes (user script).

---

## Notes

- Remote companion likely needs: embedded HTTP server in Rust, static mobile web UI, pairing secret, and real-time channel for logs/events (evaluate WebRTC vs LAN WebSocket; see mobslide `desktop` + `web` split).
- Prioritize remote **feedback + review** flows first — highest value when away from desk.
