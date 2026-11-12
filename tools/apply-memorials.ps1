<#
  Applies verified Find a Grave matches to the full family-tree.json.
  Input: a JSON array of {id, mem, b, bp, d, dp, cem, loc, photo, insc}.
  - Fills birth/death dates and places only where ours is missing or less
    specific; a conflicting full value is recorded as a fact instead.
  - Adds burial, gravestone (photo + memorial link) and a source.
#>
param(
  [Parameter(Mandatory = $true)][string]$Matches,
  [string]$Data = (Join-Path $env:USERPROFILE 'OneDrive\Desktop\family-tree.json'),
  [string[]]$Upgrade = @()
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jsonio.ps1')
$d = Read-JsonFile $Data
$list = Read-JsonFile $Matches
$byId = @{}; foreach ($p in $d['people']) { $byId[$p['id']] = $p }
function NewDict { return [System.Collections.Generic.Dictionary[string, object]]::new() }
function ToList($a) { $l = New-Object System.Collections.ArrayList; if ($a) { foreach ($x in $a) { [void]$l.Add($x) } }; return , $l }
function Spec($s) { if (-not $s) { return 0 }; return ([string]$s).Length }

$n = 0
foreach ($m in $list) {
  $p = $byId[$m['id']]
  if (-not $p) { Write-Warning "unknown $($m['id'])"; continue }
  $url = "https://www.findagrave.com/memorial/$($m['mem'])"
  $src = "Find a Grave memorial $($m['mem'])"
  $facts = ToList $p['facts']

  foreach ($pair in @(@('birth', 'b', 'bp', 'birth'), @('death', 'd', 'dp', 'death'))) {
    $key, $dk, $pk, $word = $pair
    $ev = $p[$key]
    $fd = $m[$dk]; $fp = $m[$pk]
    if (-not $fd -and -not $fp) { continue }
    if (-not $ev) { $ev = NewDict; $ev['date'] = $null; $ev['place'] = $null }
    $od = [string]$ev['date']; $op = [string]$ev['place']
    if ($fd) {
      if (-not $od -or $fd.StartsWith($od)) { $ev['date'] = $fd }          # ours missing or vaguer
      elseif ($od.StartsWith($fd)) { }                                     # ours already more specific
      elseif ($od -ne $fd) {
        $f = NewDict; $f['text'] = "Find a Grave gives the $word date as $fd (this record has $od)."; $f['source'] = $src; [void]$facts.Add($f)
      }
    }
    if ($fp) {
      if (-not $op) { $ev['place'] = $fp }
      elseif ($op -ne $fp -and -not $op.Contains($fp.Split(',')[0])) {
        $f = NewDict; $f['text'] = "Find a Grave gives the $word place as $fp."; $f['source'] = $src; [void]$facts.Add($f)
      }
    }
    $p[$key] = $ev
  }

  if ($m['cem'] -and -not $p['burial']) {
    $b = NewDict; $b['cemetery'] = $m['cem']; $b['location'] = $m['loc']; $b['notes'] = $null; $p['burial'] = $b
  }
  if (-not $p['gravestone']) {
    $g = NewDict
    $g['photo'] = if ($m['photo']) { "images/$($m['id']).jpg" } else { $null }
    $g['photoUrl'] = $m['photo']
    $g['photoCredit'] = if ($m['photo']) { 'Find a Grave contributor (see memorial page). For personal use; ask the contributor before publishing.' } else { $null }
    $g['photoNote'] = if ($m['photo']) { $null } else { 'No gravestone photo on Find a Grave yet.' }
    $g['memorialUrl'] = $url; $g['searchUrl'] = $null
    $g['note'] = if ($m['cem']) { "$($m['cem'])$(if ($m['loc']) { ', ' + $m['loc'] })." } else { $null }
    $p['gravestone'] = $g
  }
  if ($m['insc']) { $f = NewDict; $f['text'] = "Gravestone inscription: $($m['insc'])"; $f['source'] = $src; [void]$facts.Add($f) }
  $p['facts'] = $facts

  $srcs = ToList $p['sources']
  if (-not ($srcs | Where-Object { $_['url'] -eq $url })) { $s = NewDict; $s['title'] = "$($p['name']), Find a Grave memorial $($m['mem'])"; $s['url'] = $url; [void]$srcs.Add($s) }
  $p['sources'] = $srcs
  if ($Upgrade -contains $m['id'] -and $p['status'] -eq 'lead') { $p['status'] = 'likely' }
  $n++
}
Write-JsonFile $d $Data
Write-Host "Applied $n memorial matches."
