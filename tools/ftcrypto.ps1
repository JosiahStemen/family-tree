# Shared crypto for the family-tree data file (matches js/app.js).
# PBKDF2-SHA256 -> 64 bytes (AES-256 key + HMAC key); AES-256-CBC; HMAC-SHA256 over iv + ciphertext.

function Read-Secret([string]$prompt) {
  $s = Read-Host -AsSecureString $prompt
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Get-FtKeys([string]$Password, [byte[]]$Salt, [int]$Iterations) {
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes(([Text.Encoding]::UTF8.GetBytes($Password)), $Salt, $Iterations, [Security.Cryptography.HashAlgorithmName]::SHA256)
  return , $kdf.GetBytes(64)
}

# Returns the decrypted UTF-8 text, or $null when the password is wrong.
function Unprotect-FtFile([string]$Path, [string]$Password) {
  $enc = Get-Content $Path -Raw -Encoding utf8 | ConvertFrom-Json
  $salt = [Convert]::FromBase64String($enc.salt)
  $iv = [Convert]::FromBase64String($enc.iv)
  $ct = [Convert]::FromBase64String($enc.ct)
  $keys = Get-FtKeys $Password $salt ([int]$enc.iter)
  $hmac = New-Object Security.Cryptography.HMACSHA256(, [byte[]]$keys[32..63])
  $mac = [Convert]::ToBase64String($hmac.ComputeHash([byte[]]($iv + $ct)))
  if ($mac -ne $enc.mac) { return $null }
  $aes = [Security.Cryptography.Aes]::Create()
  $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.KeySize = 256
  $aes.Key = [byte[]]$keys[0..31]; $aes.IV = $iv
  $plain = $aes.CreateDecryptor().TransformFinalBlock($ct, 0, $ct.Length)
  return [Text.Encoding]::UTF8.GetString($plain)
}

function Protect-FtText([string]$Text, [string]$Password, [byte[]]$Salt, [int]$Iterations, [string]$Out) {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  if (-not $Salt) { $Salt = New-Object byte[] 16; $rng.GetBytes($Salt) }
  $iv = New-Object byte[] 16; $rng.GetBytes($iv)
  $keys = Get-FtKeys $Password $Salt $Iterations
  $plain = [Text.Encoding]::UTF8.GetBytes($Text)
  $aes = [Security.Cryptography.Aes]::Create()
  $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.KeySize = 256
  $aes.Key = [byte[]]$keys[0..31]; $aes.IV = $iv
  $ct = $aes.CreateEncryptor().TransformFinalBlock($plain, 0, $plain.Length)
  $hmac = New-Object Security.Cryptography.HMACSHA256(, [byte[]]$keys[32..63])
  $mac = $hmac.ComputeHash([byte[]]($iv + $ct))
  $obj = [ordered]@{
    v = 1; kdf = 'PBKDF2-SHA256'; iter = $Iterations; cipher = 'AES-256-CBC+HMAC-SHA256'
    saved = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    salt = [Convert]::ToBase64String($Salt); iv = [Convert]::ToBase64String($iv)
    mac = [Convert]::ToBase64String($mac); ct = [Convert]::ToBase64String($ct)
  }
  $outDir = Split-Path $Out -Parent
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  [IO.File]::WriteAllText($Out, ($obj | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
  return $plain.Length
}

# Where the GitHub key for family editing is kept on this computer (encrypted to this Windows account).
$FtEditKeyPath = Join-Path $env:LOCALAPPDATA 'family-tree\edit-key.txt'
