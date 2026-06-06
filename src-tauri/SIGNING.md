# macOS code signing & notarization

The macOS bundle is signed with a **Developer ID Application** certificate and
notarized by Apple so Gatekeeper opens it without the "unidentified developer"
prompt. Config lives in `tauri.conf.json` (`bundle.macOS`) + `entitlements.plist`;
the actual signing identity and credentials are supplied via **environment
variables** (never committed).

**Quick start:** `./scripts/macos-sign.sh` — interactive menu for a local signed
build, the one-time CI secret setup, and cutting a tagged release. The sections
below are the manual reference.

Identity in use: `Developer ID Application: VALENTIN DANIEL* RUDLOFF (76AKU4UJH2)`
(Team ID `76AKU4UJH2`).

## App ID / App Store (future iOS + macOS track)

Direct Developer ID distribution (above) needs **no App ID**. The App Store
track does. `scripts/asc-register-bundle-id.mjs` registers the Bundle ID +
capabilities via the App Store Connect API (no deps; ES256 JWT via Node crypto):

```bash
export ASC_ISSUER_ID=…  ASC_KEY_ID=…  ASC_KEY_PATH=AuthKey_XXXX.p8
node scripts/asc-register-bundle-id.mjs                 # com.myra-agents.app, UNIVERSAL
node scripts/asc-register-bundle-id.mjs --capabilities ASSOCIATED_DOMAINS
```

Get the API key at App Store Connect → Users and Access → Integrations →
App Store Connect API (downloads the `.p8` once). **The App Store *app record*
itself can't be created via API** — Apple's `apps` resource is GET/UPDATE only;
make it by hand (Apps → New App, pick the bundle ID, check iOS + macOS).

Once the app record exists, push product-page metadata (description, keywords,
promo text, URLs, name/subtitle, privacy URL) per platform + locale from a JSON
file (same API key; shared auth in `asc-client.mjs`):

```bash
cp scripts/asc-metadata.example.json scripts/asc-metadata.json   # then edit
node scripts/asc-update-metadata.mjs --dry-run                   # preview
node scripts/asc-update-metadata.mjs                             # apply
```

Idempotent (patches existing localizations, creates missing). It does **not**
upload screenshots/previews, the binary, or submit for review — those are a
multi-step upload / Transporter / `reviewSubmissions` job, best handled by
**fastlane `deliver`** if/when an iOS build target actually exists.

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
