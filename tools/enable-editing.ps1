# One-time setup for family editing: saves the GitHub key, then re-encrypts the data with it.
$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host 'Step 1 of 2: paste the GitHub key you just made.' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'set-edit-key.ps1')
Write-Host ''
Write-Host 'Step 2 of 2: type the family password (the same one as before).' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'encrypt.ps1')
Write-Host ''
Write-Host 'All done. Tell Claude "done".' -ForegroundColor Green
