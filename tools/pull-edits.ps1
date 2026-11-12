<#
  Brings changes family members saved on the site back into your Desktop copy.

    powershell -ExecutionPolicy Bypass -File tools\pull-edits.ps1

  Gets the latest data/family-tree.enc.json from GitHub, asks for the family
  password, decrypts it, and writes it over the Desktop family-tree.json
  (after saving a dated backup next to it). The GitHub key is left out.
#>
param(
  [string]$Target = (Join-Path $env:USERPROFILE 'OneDrive\Desktop\family-tree.json'),
  [string]$Enc = (Join-Path $PSScriptRoot '..\data\family-tree.enc.json'),
  [string]$Password,          # for automated tests only
  [switch]$NoPull
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jsonio.ps1')
. (Join-Path $PSScriptRoot 'ftcrypto.ps1')

$repo = Split-Path $PSScriptRoot -Parent
if (-not $NoPull -and (Test-Path (Join-Path $repo '.git'))) {
  Write-Host 'Getting the latest copy from GitHub...'
  git -C $repo pull --ff-only --quiet
  if ($LASTEXITCODE -ne 0) { throw 'git pull failed.' }
}
if (-not $Password) { $Password = Read-Secret 'Family password' }
$text = Unprotect-FtFile $Enc $Password
$Password = $null
if ($null -eq $text) { throw 'That password does not open the site data.' }

$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue
$data = $ser.DeserializeObject($text)
if ($data['meta']) { $data['meta'].Remove('editing') | Out-Null }

$old = $null
if (Test-Path $Target) {
  $old = Read-JsonFile $Target
  $stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
  $bak = [IO.Path]::ChangeExtension($Target, $null).TrimEnd('.') + ".backup-$stamp.json"
  Copy-Item $Target $bak
  Write-Host "Backup of your old copy: $bak"
}
$have = @{}
if ($old) { foreach ($c in @($old['changes'])) { if ($c) { $have[[string]$c['id']] = 1 } } }
$new = @(@($data['changes']) | Where-Object { $_ -and -not $have.ContainsKey([string]$_['id']) })

Write-JsonFile $data $Target
Write-Host "Wrote $Target ($(@($data['people']).Count) people)."
if ($new.Count) {
  Write-Host "$($new.Count) new change(s) from the family:"
  $new | ForEach-Object { Write-Host "  - $($_['when']): $($_['summary']) (by $($_['by']))" }
} else { Write-Host 'No new family changes.' }
