#!/bin/sh
# Myra Agents — remote instance installer (macOS + Linux).
#
#   curl -sSf https://<host>/install-remote.sh | MYRA_HUB_URL=<hub> CODE=<code> sh
#
# Downloads the right myra-server binary from GitHub Releases, verifies its
# checksum, enrolls (if CODE is set), and installs a per-user service. Idempotent
# — re-run to update the binary.
set -eu

REPO="${MYRA_REPO:-Gamma-Software/Myra-Agents}"
BASE="https://github.com/${REPO}/releases/${MYRA_RELEASE:-latest/download}"

say() { printf '\033[36m[install]\033[0m %s\n' "$1"; }
die() { printf '\033[31m[install] %s\033[0m\n' "$1" >&2; exit 1; }

# 1. Detect OS + arch → release asset name.
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux)  plat="unknown-linux-gnu" ;;
  Darwin) plat="apple-darwin" ;;
  *) die "unsupported OS: $os" ;;
esac
case "$arch" in
  x86_64|amd64) cpu="x86_64" ;;
  aarch64|arm64) cpu="aarch64" ;;
  *) die "unsupported arch: $arch" ;;
esac
asset="myra-server-${cpu}-${plat}"
url="${BASE}/${asset}"

# 2. Pick install dir.
if [ "$os" = "Darwin" ] && [ -w /usr/local/bin ] 2>/dev/null; then
  bindir="/usr/local/bin"
else
  bindir="${HOME}/.local/bin"
fi
mkdir -p "$bindir"
dest="${bindir}/myra-server"

fetch() { curl -fsSL "$1" -o "$2" || die "download failed: $1"; }

say "downloading ${asset}"
tmp="$(mktemp)"
fetch "$url" "$tmp"

# Verify checksum (best-effort: skip if the .sha256 asset is missing).
if curl -fsSL "${url}.sha256" -o "${tmp}.sha256" 2>/dev/null; then
  expected="$(cut -d' ' -f1 < "${tmp}.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp" | cut -d' ' -f1)"
  else
    actual="$(shasum -a 256 "$tmp" | cut -d' ' -f1)"
  fi
  [ "$expected" = "$actual" ] || die "checksum mismatch (expected $expected, got $actual)"
  say "checksum ok"
else
  say "no checksum published — skipping verification"
fi

mv "$tmp" "$dest"
chmod +x "$dest"

# 3. macOS: clear the Gatekeeper quarantine flag on the downloaded binary.
if [ "$os" = "Darwin" ]; then
  xattr -d com.apple.quarantine "$dest" 2>/dev/null || true
fi
say "installed → $dest"

case ":$PATH:" in
  *":$bindir:"*) ;;
  *) say "note: $bindir is not on your PATH — add it to use 'myra-server' directly" ;;
esac

# 4. Enroll if a pairing code was provided.
if [ -n "${CODE:-}" ]; then
  [ -n "${MYRA_HUB_URL:-}" ] || die "CODE set but MYRA_HUB_URL is not"
  say "enrolling…"
  "$dest" enroll "$CODE"
  # 5. Install the per-user service so it survives logout/reboot.
  say "installing service…"
  "$dest" install-service
else
  say "no CODE — skipping enroll. Pair later with: myra-server enroll <code>"
fi

say "done"
