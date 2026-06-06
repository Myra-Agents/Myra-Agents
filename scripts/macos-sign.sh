#!/usr/bin/env bash
# Interactive helper for the macOS signing workflow. Three actions:
#   1) local signed (optionally notarized) build
#   2) one-time CI setup: export Developer ID .p12 → push GitHub secrets
#   3) cut a release: push a v* tag that triggers the signed CI build
#
# Run with no args for a menu, or:  ./scripts/macos-sign.sh build|ci|release
# See src-tauri/SIGNING.md for the full reference.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$HERE/.." && pwd)"
cd "$APP_ROOT"

# Detect the Developer ID Application identity from the login keychain.
DETECTED_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
  | sed -n 's/.*"\(Developer ID Application:.*\)".*/\1/p' | head -1)"
DEFAULT_TEAM_ID="76AKU4UJH2"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
die()  { printf 'error: %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- local build
do_build() {
  bold "Local signed build"

  if [[ -z "$DETECTED_IDENTITY" ]]; then
    die "no 'Developer ID Application' identity in keychain (security find-identity -v -p codesigning)"
  fi
  read -r -p "Signing identity [${DETECTED_IDENTITY}]: " IDENTITY
  export APPLE_SIGNING_IDENTITY="${IDENTITY:-$DETECTED_IDENTITY}"
  echo "  signing as: $APPLE_SIGNING_IDENTITY"

  read -r -p "Notarize + staple this build too? [y/N]: " NOTARIZE
  if [[ "$NOTARIZE" =~ ^[Yy]$ ]]; then
    read -r -p "  Apple ID (email): " APPLE_ID
    read -r -s -p "  App-specific password: " APPLE_PASSWORD; echo
    read -r -p "  Team ID [${DEFAULT_TEAM_ID}]: " APPLE_TEAM_ID
    export APPLE_ID APPLE_PASSWORD
    export APPLE_TEAM_ID="${APPLE_TEAM_ID:-$DEFAULT_TEAM_ID}"
    echo "  notarization: on"
  else
    echo "  notarization: off (signed only)"
  fi

  bold "Running: bun run tauri:build"
  bun run tauri:build

  APP_BUNDLE="$(find src-tauri/target -path '*/release/bundle/macos/*.app' -maxdepth 6 2>/dev/null | head -1)"
  if [[ -n "$APP_BUNDLE" ]]; then
    bold "Verifying $APP_BUNDLE"
    codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" || true
    echo "Gatekeeper assessment (accepted = signed+notarized):"
    spctl -a -vvv -t exec "$APP_BUNDLE" || true
  fi
}

# ------------------------------------------------------------------- CI setup
do_ci() {
  bold "CI signing setup"
  P12="${1:-}"

  if [[ -z "$P12" || ! -f "$P12" ]]; then
    cat <<'TXT'
Need a .p12 export of the Developer ID Application identity (cert + private key).
Export it from Keychain Access:
  login → My Certificates → right-click "Developer ID Application: …"
  → Export → .p12 → set a password.
TXT
    if [[ "${CI:-}" != "true" ]]; then
      read -r -p "Open Keychain Access now? [y/N]: " OPENKC
      [[ "$OPENKC" =~ ^[Yy]$ ]] && open -a "Keychain Access" || true
    fi
    read -r -p "Path to exported .p12: " P12
    [[ -f "$P12" ]] || die "file not found: $P12"
  fi

  # Delegate the actual secret-pushing to the focused helper.
  "$HERE/macos-signing-secrets.sh" "$P12"
}

# -------------------------------------------------------------------- release
do_release() {
  bold "Cut a signed release"
  command -v git >/dev/null || die "git not found"

  # Warn if the signing secrets aren't set yet (build would be unsigned in CI).
  if command -v gh >/dev/null; then
    if ! gh secret list 2>/dev/null | grep -q '^APPLE_SIGNING_IDENTITY'; then
      echo "warning: APPLE_SIGNING_IDENTITY secret not found — run option 2 (ci) first,"
      echo "         or the CI build will be unsigned."
      read -r -p "Continue anyway? [y/N]: " GO
      [[ "$GO" =~ ^[Yy]$ ]] || exit 0
    fi
  fi

  CUR_VER="$(sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' src-tauri/tauri.conf.json | head -1)"
  echo "tauri.conf.json version: ${CUR_VER:-unknown}"
  read -r -p "Tag to push (e.g. v${CUR_VER:-0.1.0}): " TAG
  [[ -n "$TAG" ]] || die "no tag given"
  [[ "$TAG" == v* ]] || die "tag must start with 'v' to trigger the Release workflow"

  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists"
  echo "Creating annotated tag $TAG at $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD)"
  read -r -p "Proceed? [y/N]: " GO
  [[ "$GO" =~ ^[Yy]$ ]] || exit 0
  git tag -a "$TAG" -m "$TAG"
  git push origin "$TAG"
  bold "Pushed $TAG → Release workflow building signed bundle."
}

# ---------------------------------------------------------------------- entry
ACTION="${1:-}"
if [[ -z "$ACTION" ]]; then
  bold "macOS signing — pick an action"
  echo "  1) build    local signed build (optionally notarized)"
  echo "  2) ci       export .p12 + push GitHub signing secrets"
  echo "  3) release  push a v* tag to trigger the signed CI build"
  read -r -p "Choice [1/2/3]: " CH
  case "$CH" in
    1) ACTION=build ;;
    2) ACTION=ci ;;
    3) ACTION=release ;;
    *) die "invalid choice" ;;
  esac
fi

case "$ACTION" in
  build)   do_build ;;
  ci)      shift || true; do_ci "${1:-}" ;;
  release) do_release ;;
  *)       die "unknown action '$ACTION' (use: build | ci | release)" ;;
esac
