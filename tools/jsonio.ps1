# Shared helpers: read JSON into Dictionary/object[] and write it back in the
# same 2-space pretty format the family-tree.json file uses.
Add-Type -AssemblyName System.Web.Extensions

function Read-JsonFile([string]$Path) {
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = [int]::MaxValue
  return $ser.DeserializeObject([IO.File]::ReadAllText((Resolve-Path $Path), [Text.Encoding]::UTF8))
}

function ConvertTo-JsonString([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in $s.ToCharArray()) {
    switch ($ch) {
      '"' { [void]$sb.Append('\"') }
      '\' { [void]$sb.Append('\\') }
      "`n" { [void]$sb.Append('\n') }
      "`r" { [void]$sb.Append('\r') }
      "`t" { [void]$sb.Append('\t') }
      default {
        if ([int]$ch -lt 32) { [void]$sb.Append(('\u{0:x4}' -f [int]$ch)) } else { [void]$sb.Append($ch) }
      }
    }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function Format-Json($v, [int]$level) {
  $pad = '  ' * $level
  $pad2 = '  ' * ($level + 1)
  if ($null -eq $v) { return 'null' }
  if ($v -is [string]) { return (ConvertTo-JsonString $v) }
  if ($v -is [bool]) { if ($v) { return 'true' } else { return 'false' } }
  if ($v -is [int] -or $v -is [long] -or $v -is [decimal] -or $v -is [double]) {
    return ([System.Convert]::ToString($v, [Globalization.CultureInfo]::InvariantCulture))
  }
  if ($v -is [System.Collections.IDictionary]) {
    if ($v.Count -eq 0) { return '{}' }
    $parts = foreach ($k in $v.Keys) { $pad2 + (ConvertTo-JsonString $k) + ': ' + (Format-Json $v[$k] ($level + 1)) }
    return "{`n" + ($parts -join ",`n") + "`n$pad}"
  }
  if ($v -is [System.Collections.IEnumerable]) {
    $arr = @($v)
    if ($arr.Count -eq 0) { return '[]' }
    $parts = foreach ($x in $arr) { $pad2 + (Format-Json $x ($level + 1)) }
    return "[`n" + ($parts -join ",`n") + "`n$pad]"
  }
  return (ConvertTo-JsonString ([string]$v))
}

function Write-JsonFile($obj, [string]$Path) {
  [IO.File]::WriteAllText($Path, (Format-Json $obj 0), (New-Object Text.UTF8Encoding $false))
}
