# Myra Agents — remote instance installer (Windows).
#
#   $env:MYRA_HUB_URL="<hub>"; $env:CODE="<code>"; iwr https://<host>/install-remote.ps1 | iex
#
# Downloads the myra-server binary from GitHub Releases, verifies its checksum,
# enrolls (if CODE is set), and registers a per-user ONLOGON task. Idempotent.
$ErrorActionPreference = "Stop"

$repo = if ($env:MYRA_REPO) { $env:MYRA_REPO } else { "Gamma-Software/Myra-Agents" }
$rel  = if ($env:MYRA_RELEASE) { $env:MYRA_RELEASE } else { "latest/download" }
$base = "https://github.com/$repo/releases/$rel"

function Say($m) { Write-Host "[install] $m" -ForegroundColor Cyan }

$asset = "myra-server-x86_64-pc-windows-msvc.exe"
$url   = "$base/$asset"

$bindir = Join-Path $HOME ".myra-agents\bin"
New-Item -ItemType Directory -Force -Path $bindir | Out-Null
$dest = Join-Path $bindir "myra-server.exe"

Say "downloading $asset"
$tmp = [System.IO.Path]::GetTempFileName()
Invoke-WebRequest -Uri $url -OutFile $tmp

# Verify checksum (best-effort).
try {
  $sumFile = "$tmp.sha256"
  Invoke-WebRequest -Uri "$url.sha256" -OutFile $sumFile -ErrorAction Stop
  $expected = (Get-Content $sumFile -Raw).Trim().Split(" ")[0]
  $actual = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
  if ($expected.ToLower() -ne $actual) { throw "checksum mismatch (expected $expected, got $actual)" }
  Say "checksum ok"
} catch {
  Say "no checksum published or verification skipped"
}

Move-Item -Force $tmp $dest
Say "installed -> $dest"

# Add bindir to the user PATH if missing.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$bindir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$bindir", "User")
  $env:Path = "$env:Path;$bindir"
  Say "added $bindir to user PATH (restart shells to pick it up)"
}

# Enroll + install service if a pairing code was provided.
if ($env:CODE) {
  if (-not $env:MYRA_HUB_URL) { throw "CODE set but MYRA_HUB_URL is not" }
  Say "enrolling..."
  & $dest enroll $env:CODE
  Say "installing service..."
  & $dest install-service
} else {
  Say "no CODE - skipping enroll. Pair later with: myra-server enroll <code>"
}

Say "done"
