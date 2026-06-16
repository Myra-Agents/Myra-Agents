#!/usr/bin/env bash
# Push the macOS code-signing + notarization secrets used by
# .github/workflows/release.yml to this repo's GitHub Actions secrets.
#
# Prereq: export your "Developer ID Application" identity (cert + private key)
# from Keychain Access as a .p12:
#   Keychain Access → login → My Certificates → right-click the
#   "Developer ID Application: …" identity → Export → .p12 → set a password.
#
# Then:  ./scripts/macos-signing-secrets.sh path/to/cert.p12
#
# Reads the remaining values interactively. Requires `gh` (authenticated).
set -euo pipefail

P12="${1:-}"
if [[ -z "$P12" || ! -f "$P12" ]]; then
  echo "usage: $0 path/to/DeveloperID.p12" >&2
  exit 1
fi
command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }

# Auto-detect the signing identity string from the keychain if present.
DEFAULT_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
  | sed -n 's/.*"\(Developer ID Application:.*\)".*/\1/p' | head -1)"

read -r -s -p "p12 export password: " P12_PASS; echo
read -r -p "Signing identity [${DEFAULT_IDENTITY}]: " IDENTITY
IDENTITY="${IDENTITY:-$DEFAULT_IDENTITY}"
read -r -p "Apple ID (notarization email): " APPLE_ID
cat <<'TXT'
App-specific password (NOT your Apple ID login password). Mint one at:
  appleid.apple.com → Sign-In & Security → App-Specific Passwords → +
Format: xxxx-xxxx-xxxx-xxxx. Required because the account has 2FA.
Also accept any pending agreements at appstoreconnect.apple.com (else 401).
TXT
read -r -s -p "App-specific password: " APPLE_PW; echo
read -r -p "Apple Team ID [76AKU4UJH2]: " TEAM_ID
TEAM_ID="${TEAM_ID:-76AKU4UJH2}"

# base64 with no line wraps (-i input, -A = one line on macOS `base64`).
CERT_B64="$(base64 -i "$P12" | tr -d '\n')"

set_secret() { printf '%s' "$2" | gh secret set "$1"; echo "  set $1"; }

echo "Pushing secrets…"
set_secret APPLE_CERTIFICATE          "$CERT_B64"
set_secret APPLE_CERTIFICATE_PASSWORD "$P12_PASS"
set_secret APPLE_SIGNING_IDENTITY     "$IDENTITY"
set_secret APPLE_ID                   "$APPLE_ID"
set_secret APPLE_PASSWORD             "$APPLE_PW"
set_secret APPLE_TEAM_ID              "$TEAM_ID"
echo "Done. Push a v* tag (or run the Release workflow) to build signed + notarized."
