#!/usr/bin/env bash
#
# Validate the Myra Agents Tauri (desktop) app on macOS.
#
# Runs the automatable ceiling for macOS (no WKWebView WebDriver exists):
#   1. Frontend type-check   (tsc --noEmit)
#   2. Rust compile gate      (cargo check)
#   3. Optional release build (--build → cargo build, slow)
#   4. Launch the real app (tauri:dev), wait for its window, and screenshot it
#      so frameless-window / traffic-lights / tray rendering can be eyeballed.
#
# Gates 1-2 determine the exit code. The screenshot is best-effort: it needs the
# terminal to hold macOS Screen-Recording permission (System Settings → Privacy
# & Security → Screen Recording). If missing, capture is skipped with a warning,
# not a failure.
#
# Usage:
#   .claude/skills/validate-tauri-app/run.sh [--build] [--no-screenshot] [--keep-open]
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ART_DIR="$REPO_ROOT/.claude/skills/validate-tauri-app/artifacts"
LOG="$(mktemp -t myra-tauri-dev.XXXXXX.log)"
DO_BUILD=0
DO_SHOT=1
KEEP_OPEN=0
# Process names the dev binary may appear under (Cargo bin is "app";
# the bundle/product name is "Myra Agents").
CANDIDATES=("Myra Agents" "app")

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=1 ;;
    --no-screenshot) DO_SHOT=0 ;;
    --keep-open) KEEP_OPEN=1 ;;
    *) echo "[validate-tauri] unknown arg: $arg"; exit 2 ;;
  esac
done

log() { echo "[validate-tauri] $*"; }
fail=0
DEV_PID=""

cleanup() {
  if [[ -n "$DEV_PID" && "$KEEP_OPEN" -eq 0 ]]; then
    log "stopping tauri:dev (pid $DEV_PID) + children"
    pkill -P "$DEV_PID" 2>/dev/null
    kill "$DEV_PID" 2>/dev/null
    # Kill the Next dev server it spawned and any leftover app process.
    lsof -ti:1420 2>/dev/null | xargs kill 2>/dev/null
    for n in "${CANDIDATES[@]}"; do pkill -f "target/debug/$n" 2>/dev/null; done
  fi
}
trap cleanup EXIT

# ---------- Gate 1: frontend types ----------
log "gate 1/3 — tsc --noEmit"
if (cd "$REPO_ROOT" && npx tsc --noEmit); then
  log "  PASS types"
else
  log "  FAIL types"; fail=1
fi

# ---------- Gate 2: rust compile ----------
log "gate 2/3 — cargo check"
if (cd "$REPO_ROOT/src-tauri" && cargo check --message-format short); then
  log "  PASS cargo check"
else
  log "  FAIL cargo check"; fail=1
fi

# ---------- Gate 3 (optional): build ----------
if [[ "$DO_BUILD" -eq 1 ]]; then
  log "gate 3/3 — cargo build (release-ish, slow)"
  if (cd "$REPO_ROOT/src-tauri" && cargo build); then
    log "  PASS cargo build"
  else
    log "  FAIL cargo build"; fail=1
  fi
else
  log "gate 3/3 — cargo build skipped (pass --build to enable)"
fi

# Don't bother launching the GUI if it can't compile.
if [[ "$fail" -ne 0 ]]; then
  log "compile gates failed — skipping app launch"
  exit 1
fi

if [[ "$DO_SHOT" -eq 0 ]]; then
  log "screenshot disabled — done (gates green)"
  exit 0
fi

# ---------- Launch + screenshot ----------
mkdir -p "$ART_DIR"
log "launching tauri:dev (logs: $LOG)"
(cd "$REPO_ROOT" && bun run tauri:dev >"$LOG" 2>&1) &
DEV_PID=$!

# Find the app window via Accessibility. First launch compiles Rust → allow time.
log "waiting for app window (up to 180s; first run compiles Rust)…"
BOUNDS=""
PROC=""
for i in $(seq 1 180); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    log "tauri:dev exited early — see log:"; tail -20 "$LOG"; exit 2
  fi
  for n in "${CANDIDATES[@]}"; do
    pos=$(osascript -e "tell application \"System Events\" to tell process \"$n\" to get position of window 1" 2>/dev/null)
    siz=$(osascript -e "tell application \"System Events\" to tell process \"$n\" to get size of window 1" 2>/dev/null)
    if [[ -n "$pos" && -n "$siz" ]]; then
      BOUNDS="$pos|$siz"; PROC="$n"; break
    fi
  done
  [[ -n "$BOUNDS" ]] && break
  sleep 1
done

if [[ -z "$BOUNDS" ]]; then
  log "WARN: app window not found via Accessibility within timeout."
  log "      (Grant Terminal 'Accessibility' permission, or the app failed to open.)"
  log "      Last dev log lines:"; tail -15 "$LOG"
  exit 0   # gates already passed; screenshot is best-effort
fi

log "found window under process \"$PROC\" — settling 2s"
sleep 2

# Parse "x, y|w, h" → integers.
x=$(echo "$BOUNDS" | cut -d'|' -f1 | cut -d',' -f1 | tr -d ' ')
y=$(echo "$BOUNDS" | cut -d'|' -f1 | cut -d',' -f2 | tr -d ' ')
w=$(echo "$BOUNDS" | cut -d'|' -f2 | cut -d',' -f1 | tr -d ' ')
h=$(echo "$BOUNDS" | cut -d'|' -f2 | cut -d',' -f2 | tr -d ' ')

STAMP="$(date +%Y%m%d-%H%M%S)"
SHOT="$ART_DIR/tauri-window-$STAMP.png"
log "capturing region ${w}x${h} at ${x},${y} → $SHOT"
# -x: no capture sound. -R: region.
screencapture -x -R"${x},${y},${w},${h}" "$SHOT" 2>/dev/null

if [[ -f "$SHOT" ]]; then
  bytes=$(stat -f%z "$SHOT" 2>/dev/null || echo 0)
  if [[ "$bytes" -lt 2000 ]]; then
    log "WARN: screenshot is tiny ($bytes bytes) — likely missing Screen-Recording permission."
    log "      Grant it: System Settings → Privacy & Security → Screen Recording → add your terminal."
  else
    log "screenshot OK ($bytes bytes): $SHOT"
  fi
else
  log "WARN: screencapture produced no file (check Screen-Recording permission)."
fi

log "done — gates green; screenshot saved (eyeball it for window chrome/tray)."
exit 0
