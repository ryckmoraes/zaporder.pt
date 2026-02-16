param(
  [string]$VmHost = "ubuntu@zaporder-vnic.tail04f1e2.ts.net",
  [string]$SshKey = "C:\Users\Maria\Downloads\ssh-key-2026-02-16.key",
  [string]$RemoteRoot = "/var/www/zaporder",
  [string]$AssetName = "index-5911a1c4.js",
  [string]$Version = "",
  [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Run-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )
  Write-Host "==> $Label"
  & $Action
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Require-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Required file not found: $Path"
  }
}

Require-Command node
Require-Command ssh
Require-Command scp

$localAsset = Join-Path $PSScriptRoot "dist_clean\assets\$AssetName"
Require-File $localAsset
Require-File (Join-Path $PSScriptRoot "validate_encoding.js")
Require-File (Join-Path $PSScriptRoot "predeploy_safe.js")
Require-File $SshKey

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
}

Run-Step "Validate encoding (block deploy on mojibake)" {
  & node .\validate_encoding.js .\dist_clean\assets .\assets
  if ($LASTEXITCODE -ne 0) { throw "Encoding validation failed." }
}

Run-Step "Generate predeploy manifest" {
  & node .\predeploy_safe.js
  if ($LASTEXITCODE -ne 0) { throw "Predeploy manifest step failed." }
}

if ($SkipUpload) {
  Write-Host "[ok] local validation finished. Upload skipped (-SkipUpload)."
  Write-Host "[next] run again without -SkipUpload to publish on VM."
  exit 0
}

$tmpRemoteAsset = "/tmp/$AssetName"
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$remoteAsset = "$RemoteRoot/assets/$AssetName"
$remoteIndex = "$RemoteRoot/index.html"
$remoteBackup = "$remoteAsset.bak_deploysafe_$timestamp"
$remoteIndexBackup = "$remoteIndex.bak_deploysafe_$timestamp"

Run-Step "Upload asset to VM temp path" {
  & scp -i $SshKey $localAsset "${VmHost}:$tmpRemoteAsset"
  if ($LASTEXITCODE -ne 0) { throw "SCP upload failed." }
}

Run-Step "Install asset + bump version in index.html + verify bytes" {
  $remoteScript = @'
set -eux

REMOTE_ASSET="__REMOTE_ASSET__"
REMOTE_INDEX="__REMOTE_INDEX__"
TMP_ASSET="__TMP_ASSET__"
REMOTE_BACKUP="__REMOTE_BACKUP__"
REMOTE_INDEX_BACKUP="__REMOTE_INDEX_BACKUP__"
NEW_VERSION="__VERSION__"

sudo test -f "$TMP_ASSET"
sudo test -f "$REMOTE_ASSET"
sudo test -f "$REMOTE_INDEX"

sudo cp "$REMOTE_ASSET" "$REMOTE_BACKUP"
sudo install -m 0644 -o www-data -g www-data "$TMP_ASSET" "$REMOTE_ASSET"
sudo cp "$REMOTE_INDEX" "$REMOTE_INDEX_BACKUP"
sudo sed -i -E "s/index-5911a1c4\.js\?v=[0-9]+/index-5911a1c4.js?v=$NEW_VERSION/g" "$REMOTE_INDEX"
sudo rm -f "$TMP_ASSET"

REMOTE_ASSET_ENV="$REMOTE_ASSET" REMOTE_INDEX_ENV="$REMOTE_INDEX" NEW_VERSION_ENV="$NEW_VERSION" python3 -c '
from pathlib import Path
import os
import sys

asset = Path(os.environ["REMOTE_ASSET_ENV"])
index = Path(os.environ["REMOTE_INDEX_ENV"])
new_version = os.environ["NEW_VERSION_ENV"]
b = asset.read_bytes()
s = index.read_text("utf-8", "strict")

bad_patterns = {
    "bad_automa": b"automa\\xc3\\x83\\xc2\\xa7\\xc3\\x83\\xc2\\xa3o",
    "bad_cardapio": b"Card\\xc3\\x83\\xc2\\xa1pio",
    "bad_ola_emoji": b"Ol\\xc3\\x83\\xc2\\xa1! Gostaria de fazer um pedido? \\xc3\\xb0\\xc5\\xb8\\xcb\\x9c\\xc5\\xa0",
    "bad_star": b"Voc\\xc3\\x83\\xc2\\xaa tem 3 \\xc3\\xa2\\xc2\\xad\\xc2\\x90 para trocar por desconto!",
    "bad_revolucionario": b"Sistema Revolucion\\xc3\\x83\\xc2\\xa1rio",
}

bad_hits = {}
for name, pat in bad_patterns.items():
    cnt = b.count(pat)
    if cnt:
        bad_hits[name] = cnt

if bad_hits:
    print("[fail] bad encoding patterns detected:", bad_hits)
    sys.exit(1)

if f"index-5911a1c4.js?v={new_version}" not in s:
    print("[fail] index version bump not found")
    sys.exit(1)

print("[ok] remote deploy validated")
'
'@

  $remoteScript = $remoteScript.Replace("__REMOTE_ASSET__", $remoteAsset)
  $remoteScript = $remoteScript.Replace("__REMOTE_INDEX__", $remoteIndex)
  $remoteScript = $remoteScript.Replace("__TMP_ASSET__", $tmpRemoteAsset)
  $remoteScript = $remoteScript.Replace("__REMOTE_BACKUP__", $remoteBackup)
  $remoteScript = $remoteScript.Replace("__REMOTE_INDEX_BACKUP__", $remoteIndexBackup)
  $remoteScript = $remoteScript.Replace("__VERSION__", $Version)

  $remoteScript | & ssh -i $SshKey $VmHost "bash -se"
  if ($LASTEXITCODE -ne 0) { throw "Remote install/verification failed (exit=$LASTEXITCODE)." }
}

Write-Host "[ok] deploy complete"
Write-Host "[info] asset: $remoteAsset"
Write-Host "[info] index version: $Version"
Write-Host "[info] backup asset: $remoteBackup"
Write-Host "[info] backup index: $remoteIndexBackup"
