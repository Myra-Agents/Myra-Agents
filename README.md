# Myra Agents

Based on dashboard template > [studio admin](https://next-shadcn-admin-dashboard.vercel.app)

A Windows tray app that lets you schedule and run anything — PowerShell snippets, scripts, executables, built-in cleanups, or GitHub Copilot CLI prompts — with a friendly UI on top of the Windows Task Scheduler, plus live, persistent run logs.

> **Platform:** Windows only · **Runtime:** .NET 8 (`net8.0-windows`, WinForms) · **License:** see repo

---

## Why Myra Agents?

The built-in Windows Task Scheduler is powerful but clunky: cryptic UI, no run history beyond a status code, no live output, no way to schedule "run an LLM prompt on this folder every morning". Myra Agents wraps it with:

- A clean WinForms UI and system tray presence.
- A unified concept of a *task* that can be a shell command, a script, an `.exe`, a canned cleanup action, or a **Copilot CLI prompt**.
- Real Windows Scheduled Tasks under the hood for `Interval` / `Daily` / `Weekly` schedules (so they fire even when the GUI is closed), and lightweight in-process management for `AtLogon` / `Manual` tasks.
- A persistent, per-task **run log** with live streaming stdout/stderr, rendered as Markdown.

---

## Features

### Action types

| Type | What it runs | How |
|---|---|---|
| **ShellCommand** | A PowerShell one-liner / multi-liner | `powershell.exe -NoProfile -WindowStyle Hidden -EncodedCommand <base64>` |
| **Script** | `.ps1`, `.bat`/`.cmd`, `.py`, or any other file | Dispatched to PowerShell / `cmd.exe` / `python` / direct exec by extension |
| **Executable** | Any `.exe` with arguments | Direct `Process.Start` |
| **BuiltIn** | A canned PowerShell snippet from a small library | See [Built-in actions](#built-in-actions) |
| **CopilotPrompt** | A GitHub Copilot CLI prompt | `copilot -p "<prompt>" --yolo` in the configured working directory |

Every action can optionally specify a **working directory** and a **"Run as admin"** flag (which is honored by mapping to `TaskRunLevel.Highest` for scheduled tasks).

### Schedule types

| Type | Behavior | Backed by |
|---|---|---|
| **Interval** | Every *N* minutes/hours starting at a chosen time | Windows Task Scheduler (`TimeTrigger` with repetition) |
| **Daily** | Once a day at a chosen time | Windows Task Scheduler (`DailyTrigger`) |
| **Weekly** | On selected weekdays at a chosen time | Windows Task Scheduler (`WeeklyTrigger`) |
| **AtLogon** | Launched in-process when Myra Agents starts | Myra Agents itself (no Windows scheduled task created) |
| **Manual** | Only runs when you click **Run Now** | Myra Agents itself |

> Scheduled tasks are registered under the name `Myra Agents_<id>` and always invoke `Myra Agents.exe --run <id>` as their action, so even when fired by Windows while the GUI is closed the execution is logged the same way as a manual run.

### Built-in actions

A short library of common housekeeping snippets — no scripting required:

- **Clean Downloads Folder** — deletes files older than 30 days in `%USERPROFILE%\Downloads`.
- **Empty Recycle Bin** — `Clear-RecycleBin -Force`.
- **Clear Temp Files** — removes files older than 7 days from `%TEMP%`.
- **Flush DNS Cache** — `Clear-DnsClientCache`.

Adding a new one is one entry in `BuiltInAction.All`.

### Live, persistent run logs

- Every execution creates a `TaskRunLog` (id, started/finished timestamps, status, exit code, full stdout, full stderr).
- stdout/stderr is streamed asynchronously into the log (`BeginOutputReadLine` + `OutputDataReceived`), so you can watch long-running tasks in real time.
- Logs are saved to disk, throttled to ≤ 1 write/second, so nothing is lost on crash.
- Each task keeps its last **50** runs.
- If Myra Agents is killed mid-run, any `Running` entry left over is auto-recovered as **Failed (orphaned)** on next start.
- The log viewer renders output as **Markdown in a WebView2** (dark theme) with a Raw/Rendered toggle and tail-follow (auto-scroll-to-bottom when you're already at the bottom). Falls back to a plain `TextBox` if the WebView2 Runtime is missing.

### Tray app niceties

- **Single instance** — enforced by a named mutex (`Myra Agents_SingleInstance`).
- **`--minimized`** — start straight to the tray, no main window.
- **Tray tooltip** shows the number of active tasks and the next run time.
- **Start with Windows** — toggle in the tray menu; writes `HKCU\…\Run\Myra Agents` pointing at `Myra Agents.exe --minimized`.
- **Left-click** the tray icon to open the main window.

---

## Architecture (one-paragraph version)

`Program.Main` either runs the **helper mode** (`--run <taskId>`, invoked by Windows Task Scheduler — executes one task, logs it, exits) or starts the WinForms `ApplicationContext` (`Myra AgentsContext`). The context owns three singleton services — `TaskStorageService` (tasks, JSON in `%APPDATA%\Myra Agents\tasks.json`), `TaskLogService` (run history, `%APPDATA%\Myra Agents\logs.json`, capped at 50 entries/task), and `TaskSchedulerService` (the bridge to the Windows Task Scheduler API via the `TaskSchedulerEditor` NuGet, and the in-process runner for `AtLogon` / `Manual` tasks). The GUI (`MainForm`, `TaskEditForm`, `TaskLogForm`) is created on demand and disposed when closed — Myra Agents keeps living in the tray.

### Project layout

```
Myra Agents/
├── Program.cs               # Entry point + --run helper mode
├── Myra AgentsContext.cs      # ApplicationContext: tray icon, services, AtLogon launcher
├── Models/
│   ├── TaskItem.cs          # The main entity (ActionType + ScheduleType + options)
│   ├── BuiltInAction.cs     # Static library of canned PS snippets
│   └── TaskRunLog.cs        # One execution record (live-updated)
├── Services/
│   ├── TaskStorageService.cs    # tasks.json load/save
│   ├── TaskLogService.cs        # logs.json load/save + streaming append + orphan recovery
│   ├── TaskSchedulerService.cs  # Windows Task Scheduler bridge + in-process runner
│   └── AutoStartService.cs      # HKCU\…\Run registry toggle
├── Forms/
│   ├── MainForm.cs          # Task list, CRUD, Run Now, Open Logs
│   ├── TaskEditForm.cs      # Editor (UI adapts to ActionType / ScheduleType)
│   └── TaskLogForm.cs       # Markdown log viewer (WebView2, live timer, tail-follow)
└── Resources/app.ico
```

### Where things are stored

| Path | What |
|---|---|
| `%APPDATA%\Myra Agents\tasks.json` | All task definitions |
| `%APPDATA%\Myra Agents\logs.json` | Run history (last 50 per task) |
| `%LOCALAPPDATA%\Myra Agents\WebView2` | WebView2 user-data folder |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Myra Agents` | Auto-start entry (when enabled) |
| Windows Task Scheduler: `Myra Agents_<id>` | One per `Interval`/`Daily`/`Weekly` task |

JSON is human-readable: `WriteIndented`, `CamelCase`, enums serialized as strings.

---

## Build & run

```powershell
dotnet build Myra Agents.sln
Start-Process .\Myra Agents\bin\Debug\net8.0-windows\Myra Agents.exe
```

Optional flags:

- `--minimized` — start to tray with no window.
- `--run <taskId>` — internal helper mode used by Windows Task Scheduler. Not meant to be called by hand, but it works: it runs one task and writes a log entry, then exits with the task's exit code.

> ⚠️ Before rebuilding, **kill any running instance** (`Stop-Process -Id <pid>`). The single-instance mutex doesn't lock the file, but the running `Myra Agents.exe` does, so the build copy step will fail with **MSB3027** otherwise.

### Dependencies

- [`TaskSchedulerEditor`](https://www.nuget.org/packages/TaskSchedulerEditor) — managed wrapper around the Windows Task Scheduler 2.0 API.
- [`Markdig`](https://www.nuget.org/packages/Markdig) — renders log output to HTML.
- [`Microsoft.Web.WebView2`](https://www.nuget.org/packages/Microsoft.Web.WebView2) — embedded Chromium for the log viewer. If the **WebView2 Runtime** isn't installed, the log viewer falls back to a raw `TextBox`.

There is **no test suite, no linter, no CI** — verification is `dotnet build` + a manual smoke test.

---

## Usage

1. Launch `Myra Agents.exe`. The main window opens (or, with `--minimized`, just the tray icon).
2. **Add task** → pick an action type, fill in the command/script/prompt, pick a schedule.
3. Click **Run Now** to test it. Open **Logs** to watch live stdout/stderr rendered as Markdown.
4. Close the window — the app stays in the tray. Right-click the tray icon for **Open**, **Start with Windows**, and **Exit**.

### Example: a daily Copilot CLI summary

- **Action**: CopilotPrompt
- **Prompt**: `Summarize today's changes in this repo as a short markdown bullet list.`
- **Working directory**: `C:\Users\you\code\my-repo`
- **Schedule**: Daily at 18:30

Myra Agents will register a Windows scheduled task `Myra Agents_<id>` that fires `Myra Agents.exe --run <id>` every day at 18:30. The helper mode invokes `copilot -p "…" --yolo` in your repo, streams the output into a log entry, and you can read the rendered Markdown summary in the log viewer.

---

## Caveats & sharp edges

- **Windows-only.** Hard dependency on the Windows Task Scheduler API and WinForms.
- **CopilotPrompt** requires the [GitHub Copilot CLI](https://github.com/github/copilot-cli) (`copilot` on `PATH`).
- **"Run as admin"** only takes effect for scheduled tasks (`Interval`/`Daily`/`Weekly`). `AtLogon` and `Manual` tasks always run with whatever privileges Myra Agents itself has.
- The 30-minute hard timeout (`process.WaitForExit(30 min)`) and the 1-hour `ExecutionTimeLimit` on the scheduled task are not currently user-configurable.
- Logs are kept in a single JSON file per app — fine for personal use, not designed for thousands of runs/day.

---

## Contributing tips

- Anything touching `TaskItem` must **branch on `ScheduleType.AtLogon || Manual`** before calling into the Windows Task Scheduler — those types are no-ops there.
- New `ActionType`? Extend `BuildProcessStartInfo` in `TaskSchedulerService` and the UI in `TaskEditForm`. PowerShell commands should always go through `EncodeCommand()` (base64-UTF16) to survive quoting.
- New built-in action? One entry in `BuiltInAction.All` — the dropdown and execution pick it up via `BuiltInActionId`.
- House style: file-scoped namespaces, nullable enabled, implicit usings, target-typed `new()`, collection expressions (`[]`).
