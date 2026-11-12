<#
  Encrypts the full family-tree.json for the password-protected site.

  Run it yourself and type the password when asked (it is never stored):
    powershell -ExecutionPolicy Bypass -File tools\encrypt.ps1

  Output: data/family-tree.enc.json
  Crypto: PBKDF2-SHA256 (600,000 rounds, random salt) -> 64-byte key;
          AES-256-CBC for the data, HMAC-SHA256 over (iv + ciphertext).
  The site (js/app.js) reverses this in the browser with WebCrypto.
#>
param(
  [string]$Source = (Join-Path $env:USERPROFILE 'OneDrive\Desktop\family-tree.json'),
  [string]$Out = (Join-Path $PSScriptRoot '..\data\family-tree.enc.json'),
  [string]$Password,          # for automated tests only; normally leave blank and type it
  [int]$Iterations = 600000
)
$ErrorActionPreference = 'Stop'

function Read-Secret([string]$prompt) {
  $s = Read-Host -AsSecureString $prompt
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

if (-not $Password) {
  $p1 = Read-Secret 'Choose the family password'
  $p2 = Read-Secret 'Type it again'
  if ($p1 -ne $p2) { throw 'The two passwords did not match. Nothing was written.' }
  if ($p1.Length -lt 12) { Write-Warning 'That password is short. Something longer (like four random words) is much harder to guess.' }
  $Password = $p1
}

$plain = [IO.File]::ReadAllBytes((Resolve-Path $Source))
# sanity check: it must be valid JSON with people
$null = ([Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json).people.Count

$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$salt = New-Object byte[] 16; $rng.GetBytes($salt)
$iv = New-Object byte[] 16; $rng.GetBytes($iv)

$kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes(([Text.Encoding]::UTF8.GetBytes($Password)), $salt, $Iterations, [Security.Cryptography.HashAlgorithmName]::SHA256)
$keys = $kdf.GetBytes(64)
$encKey = $keys[0..31]; $macKey = $keys[32..63]

$aes = [Security.Cryptography.Aes]::Create()
$aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.KeySize = 256
$aes.Key = [byte[]]$encKey; $aes.IV = $iv
$ct = $aes.CreateEncryptor().TransformFinalBlock($plain, 0, $plain.Length)

$hmac = New-Object Security.Cryptography.HMACSHA256(,[byte[]]$macKey)
$mac = $hmac.ComputeHash([byte[]]($iv + $ct))

$obj = [ordered]@{
  v = 1; kdf = 'PBKDF2-SHA256'; iter = $Iterations; cipher = 'AES-256-CBC+HMAC-SHA256'
  salt = [Convert]::ToBase64String($salt); iv = [Convert]::ToBase64String($iv)
  mac = [Convert]::ToBase64String($mac); ct = [Convert]::ToBase64String($ct)
}
$outDir = Split-Path $Out -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
[IO.File]::WriteAllText($Out, ($obj | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
$Password = $null; $p1 = $null; $p2 = $null
Write-Host "Encrypted $($plain.Length) bytes -> $Out"
