<#
  Encrypts the full family-tree.json for the password-protected site.

  Run it yourself and type the password when asked (it is never stored):
    powershell -ExecutionPolicy Bypass -File tools\encrypt.ps1

  - If the password opens the current data/family-tree.enc.json, the same salt is
    kept, so devices that chose "Remember on this device" keep working.
  - If family members have saved changes on the site that your Desktop copy does
    not have yet, it stops and asks you to run tools\pull-edits.ps1 first
    (use -Force to overwrite them anyway).
  - If a GitHub key was saved with tools\set-edit-key.ps1, it is sealed inside the
    encrypted data so people with the password can save changes from the site.

  Crypto: PBKDF2-SHA256 (600,000 rounds) -> AES-256-CBC + HMAC-SHA256 (tools\ftcrypto.ps1).
#>
param(
  [string]$Source = (Join-Path $env:USERPROFILE 'OneDrive\Desktop\family-tree.json'),
  [string]$Out = (Join-Path $PSScriptRoot '..\data\family-tree.enc.json'),
  [string]$Password,          # for automated tests only; normally leave blank and type it
  [string]$KeyFile,           # for automated tests only
  [int]$Iterations = 600000,
  [switch]$NoPull,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jsonio.ps1')
. (Join-Path $PSScriptRoot 'ftcrypto.ps1')
if (-not $KeyFile) { $KeyFile = $FtEditKeyPath }

$repo = Split-Path $PSScriptRoot -Parent
if (-not $NoPull -and (Test-Path (Join-Path $repo '.git'))) {
  Write-Host 'Getting the latest copy from GitHub...'
  git -C $repo pull --ff-only --quiet
  if ($LASTEXITCODE -ne 0) { throw 'git pull failed. Fix that first (or use -NoPull).' }
}

$data = Read-JsonFile $Source
if (-not $data['people']) { throw "$Source has no people." }

$typed = [bool]$Password
if (-not $Password) { $Password = Read-Secret 'Family password' }

$salt = $null
$current = $null
if (Test-Path $Out) {
  $text = Unprotect-FtFile $Out $Password
  if ($null -ne $text) {
    $enc = Get-Content $Out -Raw | ConvertFrom-Json
    $salt = [Convert]::FromBase64String($enc.salt)
    $current = (New-Object System.Web.Script.Serialization.JavaScriptSerializer -Property @{ MaxJsonLength = [int]::MaxValue }).DeserializeObject($text)
  }
}
if ($null -eq $salt) {
  if (-not $typed) {
    Write-Host 'That is a new password (it does not open the current site data).' -ForegroundColor Yellow
    Write-Host 'Everyone will need the new password, and remembered devices will be asked again.'
    $again = Read-Secret 'Type the new password again to confirm'
    if ($again -ne $Password) { throw 'The two passwords did not match. Nothing was written.' }
    $again = $null
  }
  if ($Password.Length -lt 12) { Write-Warning 'That password is short. Something longer (like four random words) is much harder to guess.' }
}

# Don't overwrite changes family members saved on the site.
if ($current -and -not $Force) {
  $have = @{}
  foreach ($c in @($data['changes'])) { if ($c) { $have[[string]$c['id']] = 1 } }
  $missing = @(@($current['changes']) | Where-Object { $_ -and -not $have.ContainsKey([string]$_['id']) })
  if ($missing.Count) {
    Write-Host ''
    Write-Host "Family members have saved $($missing.Count) change(s) on the site that your Desktop copy doesn't have:" -ForegroundColor Yellow
    $missing | Select-Object -First 10 | ForEach-Object { Write-Host "  - $($_['summary']) (by $($_['by']))" }
    Write-Host ''
    Write-Host 'Run this first to bring them into your Desktop copy, then encrypt again:'
    Write-Host '  powershell -ExecutionPolicy Bypass -File tools\pull-edits.ps1'
    throw 'Nothing was written.'
  }
}

# Seal the editing key inside the encrypted data.
if (-not $data['meta']) { $data['meta'] = [System.Collections.Generic.Dictionary[string, object]]::new() }
$data['meta'].Remove('editing') | Out-Null
if (Test-Path $KeyFile) {
  $sec = (Get-Content $KeyFile -Raw).Trim() | ConvertTo-SecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
  $ed = [System.Collections.Generic.Dictionary[string, object]]::new()
  $ed['owner'] = 'JosiahStemen'; $ed['repo'] = 'family-tree'; $ed['branch'] = 'main'
  $ed['path'] = 'data/family-tree.enc.json'; $ed['token'] = $token
  $data['meta']['editing'] = $ed
  $token = $null
  Write-Host 'Family editing: ON (GitHub key sealed inside the data).'
} else {
  Write-Host 'Family editing: off (no GitHub key saved; see tools\set-edit-key.ps1).'
}

$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue
$json = $ser.Serialize($data)
$n = Protect-FtText $json $Password $salt $Iterations $Out
$Password = $null; $json = $null
Write-Host "Encrypted $n bytes -> $Out"
if ($salt) { Write-Host 'Same password as before: remembered devices keep working.' }
