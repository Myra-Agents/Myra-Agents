#!/usr/bin/env bash
# Build the Tauri desktop app for ONE macOS target triple locally and upload the
# resulting installer(s) to the app's GitHub Release — a manual fallback for when
# a release.yml matrix leg (e.g. the Intel macos-13 runner) failed or is stuck.
#
# Apple Silicon can build BOTH mac targets natively (Apple clang is a universal
# cross-compiler), so this works for x86_64-apple-darwin from an arm64 mac.
#
# The catch it handles: `tauri build --target <triple>` resolves the bundled
# `myra-server` sidecar by the BUILD-TARGET triple, but scripts/build-sidecar.mjs
# downloads the HOST triple. So we pre-place the target-matching sidecar from the
# dist repo (pinned in server-version.json) into src-tauri/binaries/ first.
#
# Usage:
#   scripts/release-macos-target.sh [TARGET] [TAG]
#     TARGET  rust target triple  (default: x86_64-apple-darwin)
#     TAG     app v* release tag   (default: latest v* tag)
#   APP_REPO env overrides the destination repo.
#
# Requires: rustup, bun, gh (authed with contents:write on the app repo).
set -euo pipefail

TARGET="${1:-x86_64-apple-darwin}"
TAG="${2:-$(git describe --tags --match 'v*' --abbrev=0)}"
APP_REPO="${APP_REPO:-Myra-Agents/Myra-Agents}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "$TARGET" in
  *-apple-darwin) ;;
  *) echo "This script only handles macOS targets (got: $TARGET)." >&2; exit 1 ;;
esac

# --- pre-place the target-matching sidecar (build-sidecar.mjs only fetches host) ---
read -r SIDECAR_REPO SIDECAR_VER < <(
  node -e 'const p=require("./server-version.json");process.stdout.write(`${p.repo} ${p.version}`)'
)
sidecar_url="https://github.com/${SIDECAR_REPO}/releases/download/${SIDECAR_VER}/myra-server-${TARGET}"
sidecar_out="src-tauri/binaries/myra-server-${TARGET}"
echo "==> fetching sidecar  $sidecar_url"
mkdir -p src-tauri/binaries
curl -fL --retry 3 -o "$sidecar_out" "$sidecar_url"
chmod +x "$sidecar_out"

# verify checksum if the .sha256 asset exists (same format build-sidecar.mjs reads)
if curl -fsL -o "$sidecar_out.sha256" "$sidecar_url.sha256" 2>/dev/null; then
  expected="$(awk '{print tolower($1)}' "$sidecar_out.sha256")"
  actual="$(shasum -a 256 "$sidecar_out" | awk '{print $1}')"
  [ "$expected" = "$actual" ] || { echo "sidecar checksum mismatch" >&2; exit 1; }
  rm -f "$sidecar_out.sha256"
  echo "==> sidecar checksum OK"
fi

# --- build ---
echo "==> building app for $TARGET (tag $TAG)"
rustup target add "$TARGET"
bun install --frozen-lockfile
bun run tauri build --target "$TARGET"

# --- collect installers ---
bundle_dir="src-tauri/target/${TARGET}/release/bundle"
[ -d "$bundle_dir" ] || { echo "no bundle dir at $bundle_dir" >&2; exit 1; }
# Upload the user-facing installers (.dmg) — skip the raw .app tree.
# (macOS ships bash 3.2, so no mapfile — read into the array by hand.)
artifacts=()
while IFS= read -r f; do
  artifacts+=("$f")
done < <(find "$bundle_dir" -type f -name '*.dmg')
[ "${#artifacts[@]}" -gt 0 ] || { echo "no .dmg produced under $bundle_dir" >&2; exit 1; }

echo "==> uploading to ${APP_REPO} release ${TAG}:"
printf '    %s\n' "${artifacts[@]}"
gh release upload "$TAG" "${artifacts[@]}" --repo "$APP_REPO" --clobber

echo "==> done: $TARGET installers published to ${APP_REPO}@${TAG}"
