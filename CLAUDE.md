# Myra Agents Claude Code Instructions

Myra Agents is a Windows-only WinForms tray app (.NET 8, `net8.0-windows`) that schedules and runs user-defined tasks: PowerShell commands, scripts, executables, built-in cleanups, and Copilot prompts. No test project exists for this WinForms app; treat this file as the source of truth for project behavior and conventions.

## Build And Run

```powershell
dotnet build Myra Agents.sln
Start-Process .\Myra Agents\bin\Debug\net8.0-windows\Myra Agents.exe
```

The app uses a single-instance mutex named `Myra Agents_SingleInstance`. Before rebuilding, kill any running instance with `Stop-Process -Id <pid>`; otherwise `Myra Agents.exe` is locked and the build can fail with `MSB3027`. In that failure mode, the C# compile may have succeeded and only the copy step failed.

Use `--minimized` to start directly to the tray.

There is no test suite, linter, or CI for this WinForms app. Verification is a successful build plus a manual run.

## Architecture

Entry flow: `Program.cs` -> `Myra AgentsContext`. `Myra AgentsContext` is the `ApplicationContext` that keeps the tray process alive, owns the singleton services, and creates `MainForm` on demand.

Services live in `Myra Agents/Services/`:

- `TaskStorageService` loads and saves the `TaskItem` list to `%APPDATA%\Myra Agents\tasks.json`.
- `TaskLogService` loads and saves run history to `%APPDATA%\Myra Agents\logs.json`. Logs are capped to `MaxLogsPerTask = 50` per task. Streaming append methods `AppendOutput` and `AppendError` use throttled saves, at most once per second, so live output is not lost on crash. During `Load()`, any leftover `Running` entry from a previous process is auto-recovered as `Failed (orphaned)`.
- `TaskSchedulerService` bridges to Windows Task Scheduler via `Microsoft.Win32.TaskScheduler`.

Scheduling split:

- `ScheduleType.Interval`, `ScheduleType.Daily`, and `ScheduleType.Weekly` are registered as real Windows Scheduled Tasks named `Myra Agents_<id>`.
- `ScheduleType.AtLogon` and `ScheduleType.Manual` are never registered in Windows Task Scheduler. They are managed in-process. `AtLogon` tasks are spawned by `LaunchAtLogonTasks()` when Myra Agents starts. `Manual` tasks only run through `Run Now`.
- `RunNow()` and `RunWithLogging()` must stream stdout and stderr asynchronously with `BeginOutputReadLine` and `OutputDataReceived` into the live `TaskRunLog`. Do not use `ReadToEnd()` here because it blocks until process exit and breaks live logs.

Models live in `Myra Agents/Models/`:

- `TaskItem` is the main entity. `SchedulerTaskName` is derived as `Myra Agents_<id>` and marked with `[JsonIgnore]`.
- `BuiltInAction.All` is the static array of canned PowerShell snippets, such as clean downloads and flush DNS, referenced by `BuiltInActionId`.
- `TaskRunLog` represents one execution. `Output` and `Error` may grow while live. `Status` transitions from `Running` to `Success` or `Failed`.

Forms live in `Myra Agents/Forms/`:

- `MainForm` owns task list and CRUD actions, and opens `TaskLogForm` per task.
- `TaskEditForm` is the editor. The visible UI depends on `ActionType` and `ScheduleType`.
- `TaskLogForm` is the log viewer. It has a 1-second `_liveTimer` that re-renders only while a `Running` entry exists or to refresh the selected log. Output renders as Markdown in a WebView2 by default, with a dark theme injected through `WrapHtml`, plus a Raw/Rendered toggle. Re-renders are skipped when the markdown body is unchanged to preserve user scroll. When the body changes, capture `scrollY` with `ExecuteScriptAsync`, navigate the page, then restore scroll, or pin to bottom if the user was already at the bottom.

## Repo Conventions

- Persistence path is always `%APPDATA%\Myra Agents\` for `tasks.json` and `logs.json`.
- WebView2 user data belongs under `%LOCALAPPDATA%\Myra Agents\WebView2`.
- JSON must use `WriteIndented = true`, camelCase property naming, and `JsonStringEnumConverter` for all enums. Keep using each service's shared `JsonOptions`.
- `TaskItem` has two scheduling backends in one model. Any new code touching scheduling must branch on `ScheduleType.AtLogon` or `ScheduleType.Manual` before calling into `TaskScheduler`; those schedule types must be no-ops there. Follow the existing guards in `TaskSchedulerService`.
- Process launching is dispatched by `ActionType` in `BuildProcessStartInfo`. PowerShell commands are always passed as `-NoProfile -WindowStyle Hidden -EncodedCommand <base64-utf16>` through `EncodeCommand()`. Mirror this when adding a new `ActionType`.
- Single-instance enforcement uses the named mutex in `Program.cs`; do not replace it with a duplicate process check.
- To add a built-in action, append to `BuiltInAction.All` only. The UI dropdown and execution pipeline pick it up through `BuiltInActionId`.
- Auto-start with Windows is implemented in `AutoStartService` through an `HKCU\...\Run` registry value, not a scheduled task.
- Use file-scoped namespaces, nullable enabled, implicit usings, target-typed `new()`, and collection expressions (`[]`).

## Dependencies

- `TaskSchedulerEditor` wraps the Windows Task Scheduler API.
- `Markdig` renders log markdown to HTML.
- `Microsoft.Web.WebView2` renders the log view. If the WebView2 Runtime is missing, the app falls back to a raw `TextBox`; see `InitializeWebViewAsync`.
