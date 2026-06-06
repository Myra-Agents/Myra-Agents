# macOS code signing & notarization

The macOS bundle is signed with a **Developer ID Application** certificate and
notarized by Apple so Gatekeeper opens it without the "unidentified developer"
prompt. Config lives in `tauri.conf.json` (`bundle.macOS`) + `entitlements.plist`;
the actual signing identity and credentials are supplied via **environment
variables** (never committed).

Identity in use: `Developer ID Application: VALENTIN DANIEL* RUDLOFF (76AKU4UJH2)`
(Team ID `76AKU4UJH2`).

## Local signed build

The cert + private key must be in your login keychain (they already are if
`security find-identity -v -p codesigning` lists the Developer ID Application
identity). Then:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: VALENTIN DANIEL* RUDLOFF (76AKU4UJH2)"
# optional — also notarize + staple locally:
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="abcd-efgh-ijkl-mnop"   # app-specific password
export APPLE_TEAM_ID="76AKU4UJH2"

bun run tauri:build
```

Without `APPLE_SIGNING_IDENTITY` the build is **ad-hoc / unsigned** (fine for
local dev). Verify a finished bundle:

```bash
codesign --verify --deep --strict --verbose=2 "src-tauri/target/release/bundle/macos/Myra Agents.app"
spctl -a -vvv -t exec "src-tauri/target/release/bundle/macos/Myra Agents.app"   # accepted = notarized
```

## CI (GitHub Actions)

`.github/workflows/release.yml` reads six repo secrets. Populate them once with
the helper (exports your identity from Keychain Access as a `.p12` first):

```bash
./scripts/macos-signing-secrets.sh path/to/DeveloperID.p12
```

| Secret | What |
|--------|------|
| `APPLE_CERTIFICATE` | base64 of the `.p12` (cert + private key) |
| `APPLE_CERTIFICATE_PASSWORD` | password set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: … (76AKU4UJH2)` |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_PASSWORD` | app-specific password (appleid.apple.com → App-Specific Passwords) |
| `APPLE_TEAM_ID` | `76AKU4UJH2` |

On macOS runners `tauri-action` imports the cert into a temporary keychain,
signs with the hardened runtime + `entitlements.plist`, then notarizes and
staples. The secrets are no-ops on Linux/Windows runners and on forks that lack
them (those builds simply stay unsigned).
