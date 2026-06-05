#!/usr/bin/env bash
# Compile the Icon Composer source (media/macicons/myra-agents.icon) into the
# artifacts Tauri bundles, so macOS 26 (Tahoe) renders the authored icon
# composition instead of auto-applying Liquid Glass to a plain .icns.
#
# Produces:
#   src-tauri/Assets.car        -> bundled into Contents/Resources (bundle.resources)
#   src-tauri/icons/icon.icns   -> legacy fallback (CFBundleIconFile)
#
# The matching Info.plist keys (CFBundleIconName=myra-agents) live in
# src-tauri/Info.plist. Re-run after editing the .icon in Icon Composer.
#
# Requires Xcode (actool). macOS only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICON="$ROOT/media/macicons/myra-agents.icon"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ ! -d "$ICON" ]; then
  echo "error: $ICON not found" >&2
  exit 1
fi

# NOTE: the .icon must be passed as a direct actool input. Wrapping it in an
# .xcassets makes actool silently emit nothing.
actool --compile "$OUT" \
  --platform macosx \
  --minimum-deployment-target 26.0 \
  --app-icon myra-agents \
  --standalone-icon-behavior all \
  --output-partial-info-plist "$OUT/partial.plist" \
  "$ICON" >/dev/null

cp "$OUT/Assets.car" "$ROOT/src-tauri/Assets.car"
cp "$OUT/myra-agents.icns" "$ROOT/src-tauri/icons/icon.icns"

echo "built: src-tauri/Assets.car + src-tauri/icons/icon.icns"
