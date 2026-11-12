<#
  Saves the GitHub key that lets family members save changes from the site.

    powershell -ExecutionPolicy Bypass -File tools\set-edit-key.ps1

  Make the key at https://github.com/settings/personal-access-tokens/new :
    - Repository access: Only select repositories -> family-tree
    - Permissions: Contents -> Read and write (nothing else)
  Paste it when asked. It is stored on this computer encrypted to your Windows
  account, and tools\encrypt.ps1 seals it inside the password-protected data.
  Use -Remove to switch family editing off (then run encrypt.ps1 again).
#>
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ftcrypto.ps1')

if ($Remove) {
  if (Test-Path $FtEditKeyPath) { Remove-Item $FtEditKeyPath }
  Write-Host 'Removed. Run tools\encrypt.ps1 to switch family editing off on the site.'
  return
}
$sec = Read-Host -AsSecureString 'Paste the GitHub key (it will not show)'
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $t = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
$t = $t.Trim()
if ($t -notmatch '^(github_pat_|ghp_)[A-Za-z0-9_]+$') { throw 'That does not look like a GitHub key (it should start with github_pat_).' }

Write-Host 'Checking the key with GitHub...'
$h = @{ Authorization = "Bearer $t"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
try {
  $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/JosiahStemen/family-tree' -Headers $h
} catch { throw "GitHub did not accept that key for the family-tree repository: $($_.Exception.Message)" }
if (-not $r.permissions.push) { throw 'The key can read the repository but cannot save to it. Give it Contents: Read and write.' }
$t = $null

$dir = Split-Path $FtEditKeyPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$sec | ConvertFrom-SecureString | Set-Content $FtEditKeyPath
Write-Host "Saved. Now run tools\encrypt.ps1 to switch on family editing." -ForegroundColor Green
