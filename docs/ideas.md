# Myra Agents — Ideas (raw)

> Raw dump, not sorted by priority. App = Kanban board that launches headless CLI
> agents (opencode/claude/copilot/custom). Cards Draft→Todo→In Progress→
> Waiting Feedback→Awaiting Review→Done. Schedules cron, planner, logs,
> connections (local sidecar + cloud hub), auth/entitlements, templates, i18n.
>
> Format: `- idea` then `→ concrete use case`.

## Agent execution / orchestration
- Multi-agent per card: N agents in parallel, compare outputs (best-of-N).
  → "Refactor this module" launched on claude + opencode + copilot, dev keeps the best diff.
- Auto done (sets a card to done automatically, no review needed).
- Agent handoff: preset changes depending on the lane (claude code → opencode review).
  → Card coded by claude in In Progress, auto-handed to a 2nd agent for review in Awaiting Review.
- Auto retry on failure (backoff, configurable max attempts).
  → Agent crashes on API rate-limit; relaunches itself 3× instead of blocking overnight.
- Cancel/pause/resume a run without brutally killing the process.
  → Dev sees the agent going the wrong way, pauses, fixes the prompt, resumes.
- Token-level streaming (not just lines) + live markdown rendering.
  → Follow the agent's reasoning word by word, catch drift early.
- Detect "agent stuck / waiting for input" → bump card to Waiting Feedback.
  → Agent asks "which file?"; the card surfaces instead of hanging.
- Budget/cost cap per card (tokens, $, wall-clock) → kill if exceeded.
  → Exploration task capped at $2; no surprise $40 bill from an infinite loop.
- Dry-run: preview the assembled prompt+args before launching.
  → Check the template actually injected the branch/repo before burning a run.
- Advanced prompt templating: variables, includes, reusable snippets.
  → "House style rules" block included in 30 cards without copy-paste.
- Card chaining (DAG): card B starts when A is done, passes the output along.
  → "Write specs" → "implement" → "write tests" as an auto pipeline.
- Be able to choose the model used (probably in the preset or overridden in the card).

## Kanban / UX board
- Sub-tasks / checklist inside a card.
  → "auth migration" card with 6 sub-steps checked off as you go.
- Labels/tags + filters + full-text search over cards & logs.
  → Filter all unfinished `bug` `frontend` cards in 1 click.
- Swimlanes (by project, agent, repo).
  → Board shared across 3 repos, one row per repo, overview at a glance.
- WIP limits per column (alert if too many In Progress).
  → Prevents launching 12 agents at once and saturating the machine.
- Bulk actions (multi-select: move, relaunch, delete).
  → Select 8 failed cards and relaunch them all after an env fix.
- List/table view + timeline/Gantt view of runs.
  → Manager wants a table sortable by duration/cost, not a board.
- Shared card templates / marketplace.
  → "add REST endpoint + test" template reused by the whole team.
- Global undo (cmd+Z) on move/delete/edit.
  → Card dragged into Trash by mistake, cmd+Z brings it back.
- Quick-add via command palette (cmd+K).
  → Idea mid-review: cmd+K, type the prompt, card created without leaving the keyboard.
- Drag a file/repo onto the board → pre-filled card.
  → Drag a project folder; card created with repo+branch already filled in.
- Be able to view a card's detail to see more things.
- For tasks where the agent creates sub-tasks (todo in the prompt, e.g.), clicking the card shows the sub-tasks as a flow diagram with nodes like a git tree; background tasks or subagents should also be visible some other way.
- Using the playground skill (installed by default by the app, e.g.) generate artifact interfaces viewable inside the app.
- Launch a card in an isolated git worktree then open a PR automatically at the end.
  → Card launched → agent works in a dedicated worktree (branch `feature/<card>`), no conflict with the main repo or with other cards running in parallel; run done → commit + push + PR opened on its own, ready to review.
- Show a Cron-style selector like crontab.guru; it's still possible to do it via day-of-week/hour/minute pickers, but you watch the cron expression evolve.

## Schedules / automation
- Conditional schedules (git changed, CI red, issue opened, websocket).
  → Launch the "fix CI" agent only when the build breaks, not every hour.
- Inbound webhooks: GitHub issue/PR → materialize a card.
  → New `good-first-fix` issue → auto card in Todo, ready to launch.
- Trigger on filesystem event (watcher already there, expose it as a trigger).
  → Saving a `.proto` → regenerate the clients automatically.
- iCal export of scheduled runs.
  → See in your calendar when the nightly batch of cards will run.
- Global schedule pause ("launch nothing" mode). (red button like on a factory robot)
  → Before a demo / during an incident, freeze everything with one toggle.
- Create a configured shortcut on the app for mac/win/linux so that right-clicking a specific file or folder can launch a special action like sorting the folder, etc.
- Use https://docs.pr-agent.ai/#how-it-works to make PRs.
- Be able to create a swarm (like ants) of tasks to do a more complex task.

## Integrations
- GitHub: open PR from a Done card, link issue, checks status in the card.
  → Agent done → "Open PR" button → CI checks shown on the card.
- Integrate provider agents via API (use the llm instead).
- GitLab / Bitbucket parity.
  → A shop on self-hosted GitLab can use Myra the same way.
- Linear / Jira / Monday: two-way sync cards ↔ tickets.
  → Linear ticket assigned → Myra card; card Done → ticket closed.
- Slack / Discord: run-end notification, inline feedback.
  → Slack ping "card X is waiting for feedback", reply from Slack.
- MCP: Myra as an MCP client, plug in external tools.
  → Agent accesses internal docs via an in-house MCP server.
- Editor: open the diff/result in VS Code / Cursor.
  → Click "open in editor" to review the diff in your usual IDE.
- Create an API to interact remotely.

## Review / feedback loop
- Built-in diff viewer (before/after) + accept/reject per hunk.
  → Keep 3 of the agent's 5 proposed hunks, reject the rest.
- Inline comments on the diff → sent back to the agent as feedback.
  → Comment "rename this var" on the line, the agent re-runs with that feedback.
- Approve & merge in one click from Awaiting Review.
  → Review OK → merge + card Done without leaving the app.
- Revision history of a card (output versions).
  → Compare v1 and v3 of the solution after 2 rounds of feedback.
- Side-by-side of several runs (compare 2 agents).
  → See claude vs opencode side by side on the same task.

## Observability / logs
- Search & filter logs (card, level, regex).
  → Find every `ERROR` line in a 2000-line run.
- Metrics: runs/day, success rate, average duration, cost per agent.
  → Notice copilot fails 2× more than claude on this repo.
- Analytics dashboard (throughput, cycle time per lane).
  → See that cards stall 3 days in Awaiting Review → bottleneck.
- Export logs (json/md) + share link.
  → Attach a buggy run's log to a bug report.
- Replay a run from logs.
  → Replay a run to understand a regression without relaunching the agent.
- Alerts (failed N times, abnormal cost).
  → Notify if a card burned $10 or failed 5 times.
- Have stats on agents' RAM, CPU usage.

## Organisation

## Enterprise / org-wide consolidation (hub)
- Connect all of a company's agents → a single central plan above the agents.
  → CTO sees in one board the 200 agents running in the company, all departments combined.
- Real-time overview of all active agents (registry + heartbeat).
  → Spot at a glance which agents are running, where, for whom, right now.
- Global usage analytics or by sector/department/team.
  → Compare the Data team's agent usage vs the Front team's over the month.
- Knowledge base built incrementally from the agents' runs.
  → Each run feeds a shared KB; the 50th agent benefits from what the other 49 learned.
- OKR alignment: see whether agents are drifting from or converging on company/department OKRs.
  → "OKR drift" heatmap: Sales dept has 8 agents working off-objective this quarter.
- Consolidating learnings across agents (promote a local learning → shared KB).
  → An agent discovers the internal naming convention; once promoted, all agents apply it.
- "Distance to OKR" score per run/agent (LLM-judge or embeddings of activity vs OKR text).
  → Measurable instead of fuzzy: each agent has an OKR-alignment % over time.
- Multi-tenant breakdown: company → departments → agents → users.
  → Company admin manages access per dept; each dept sees its own agents and metrics.
- Data boundary / privacy: choose what flows up to the hub (metadata vs content) per agent/dept, opt-in + audit.
  → Legal dept in metadata-only; marketing dept sends full content up for the KB.
- Curation of the shared KB (human or agent reviewer) before promoting a learning.
  → Avoids pollution: a dubious learning goes through review before entering the global KB.

## Collaboration / cloud (hub)
- Shared multi-user boards (connections/remote exists → push it further).
  → A team of 4 sees the same board, who's working on what.
- Real-time presence (who's looking at which card).
  → Avoid two devs launching an agent on the same card.
- Comments / mentions on cards.
  → "@alice do you approve this approach?" directly on the card.
- Roles & permissions (viewer/editor/admin).
  → Intern as viewer can't launch an agent in prod.
- Audit log of actions.
  → Know who relaunched the agent that force-pushed.
- Remote run: agent on a cloud runner, not the local machine.
  → Launch a big run and close your laptop, it keeps going server-side.

## Settings / config
- Versioned agent profiles + import/export.
  → Share your "claude + optimized args" config with a colleague.
- Secrets manager (API keys per agent, encrypted at rest).
  → OpenAI key stored encrypted, not in plaintext in a config file.
- Env vars per card / per project.
  → Staging card with `API_URL=staging`, prod card different.
- Per-repo defaults (preset, branch, args).
  → Rust repo → preset+branch `develop` pre-filled on every card.
- First-launch onboarding wizard.
  → New user guided: pick your agent, your key, your repo → first run.
- Live validation of a preset ("hello world" test run).
  → "Test" button checks the agent binary responds before real use.

## Plugins (plugins/ repo)
- Public plugin API + docs + CLI scaffolding.
  → Third-party dev builds a "deploy Vercel" plugin following the docs.
- Lifecycle hooks (pre-run, post-run, on-feedback).
  → post-run hook that posts a summary to Notion automatically.
- Plugin marketplace / in-app registry.
  → Install "GitHub PR opener" from a catalog without copying code.
- Plugin execution sandbox.
  → Community plugin isolated, can't read all your keys.

## Quality of life / desktop
- Global command palette (cmd+K) — actions, nav, search.
  → Drive everything from the keyboard: create card, go to logs, launch run.
- Full keyboard shortcuts + cheat sheet (use-global-shortcuts exists).
  → Power user chains cards without a mouse; `?` shows the list.
- Native OS notifications + dock badge on run end.
  → 20-min run done → macOS notification even with the app in the background.
- Focus / fullscreen mode on a card.
  → Concentrate on a big card without the board's noise.
- Multi-window (one board per window).
  → "Personal" board and "team" board on two screens.
- Custom themes + compact density.
  → Show 40 cards at once on a big screen in dense mode.
- Robust offline mode + sync on return.
  → Work on the train on the local board, sync when wifi comes back.
- i18n: add languages (es, de) beyond en/fr.
  → Berlin team uses the app in German.
- A11y: keyboard board navigation, ARIA, contrast.
  → Screen-reader user can move a card between columns.

## Security / reliability
- Confirmation before a destructive agent (rm, force push, drop).
  → Agent about to `git push --force` → confirmation popup.
- Per-agent sandbox/permissions (read-only vs write).
  → "review" agent in read-only can't modify the repo.
- Process resource limits (CPU/mem) on the Rust sidecar side.
  → A fork-bombing agent doesn't freeze the whole laptop.
- Board data encryption at rest.
  → Card prompts/secrets encrypted on disk, not in plaintext.
- Crash recovery: resume interrupted runs on restart.
  → App crashes mid-run → relaunch, offers to resume the card.

## Monetization / entitlements (use-entitlement exists)
- free/pro/org tiers: run quotas, cloud boards, parallel agents.
  → Free = 1 local board; Pro = cloud boards + 5 parallel agents; Org = adds org features.
- Visible usage metering (how much is left this month).
  → "120/500 runs used this month" bar.
- Team billing via the hub.
  → Single invoice for a team of 10 seats.

## R&D / wilder ideas
- "Planner" agent that auto-splits a big card into sub-cards.
  → "Build a blog" → planner creates 8 cards (auth, posts, CSS…).
- Auto-routing: Myra picks the best agent based on task type.
  → Rust task → server agent, UI task → claude, chosen on its own.
- Per-project memory: learns from past feedback.
  → After 5× "use tabs not spaces", the agent applies it without being told again.
- Voice: dictate a card prompt.
  → In a meeting, dictate "add a health endpoint" → card created.
- Mobile companion (read-only + approve feedback) via the hub.
  → Approve a waiting card from your phone over a coffee.
- Mobile app in Tauri (iOS/Android, Tauri v2 supports mobile) to view the board on a smartphone — reuses the Next.js frontend, connects to the cloud hub.
  → Check the board state and running runs from your phone, without opening the laptop.
