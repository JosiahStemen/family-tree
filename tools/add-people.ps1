<#
  Merges a spec file of new people into the full family-tree.json.
  Spec format: { "ancestorEdits": [...], "people": [...] } (see the session notes).
  - Adds each new person as a full record (same field order as the main file).
  - Links them into their parents' children lists, replacing a matching
    name-only entry ("aliases") in place when there is one.
  - Removes matching name-only strings from siblings' "siblings" lists.
  - Adds reverse spouse links, and children listed under "kids".
#>
param(
  [Parameter(Mandatory = $true)][string]$Spec,
  [string]$Data = (Join-Path $env:USERPROFILE 'OneDrive\Desktop\family-tree.json')
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jsonio.ps1')

$d = Read-JsonFile $Data
$specData = Read-JsonFile $Spec
$people = New-Object System.Collections.ArrayList
foreach ($p in $d['people']) { [void]$people.Add($p) }
$byId = @{}
foreach ($p in $people) { $byId[$p['id']] = $p }

function NewDict { return [System.Collections.Generic.Dictionary[string, object]]::new() }
function Get-($o, $k) { if ($o.ContainsKey($k)) { return $o[$k] } return $null }
function ToList($a) { $l = New-Object System.Collections.ArrayList; if ($a) { foreach ($x in $a) { [void]$l.Add($x) } }; return , $l }
function Event($date, $place) {
  if (-not $date -and -not $place) { return $null }
  $e = NewDict; $e['date'] = $date; $e['place'] = $place; return $e
}
$momSource = if ($specData.ContainsKey('sourceTitle')) { $specData['sourceTitle'] } else { 'Netzley Stemen Family Tree on Ancestry' }

# ---------- new people ----------
foreach ($s in $specData['people']) {
  $id = $s['id']
  if ($byId.ContainsKey($id)) { throw "Duplicate id $id" }
  $parents = ToList (Get- $s 'parents')
  $p = NewDict
  $p['nickname'] = Get- $s 'nickname'
  $p['sex'] = Get- $s 'sex'
  $p['living'] = [bool](Get- $s 'living')
  if (Get- $s 'minor') { $p['minor'] = $true }
  $p['status'] = Get- $s 'status'
  $p['birth'] = Event (Get- $s 'b') (Get- $s 'bplace')
  $p['death'] = Event (Get- $s 'd') (Get- $s 'dplace')
  $p['burial'] = Get- $s 'burial'
  $p['parents'] = $parents.ToArray()
  $sp = New-Object System.Collections.ArrayList
  foreach ($x in (ToList (Get- $s 'spouses'))) { [void]$sp.Add($x) }
  $p['spouses'] = $sp
  $p['children'] = New-Object System.Collections.ArrayList
  $p['siblings'] = @()
  $p['residences'] = @()
  $p['occupation'] = Get- $s 'occupation'
  $p['religion'] = $null
  $p['military'] = Get- $s 'military'

  # biography
  # (the "Son of X and Y." opener is added in the links pass, once every parent exists)
  $p['biography'] = if ($s.ContainsKey('bio')) { [string]$s['bio'] } else { '' }
  $p['facts'] = @()
  $p['gravestone'] = $null
  if ($s.ContainsKey('memorial')) {
    $g = NewDict
    $g['photo'] = $null; $g['photoUrl'] = $null; $g['photoCredit'] = $null
    $g['photoNote'] = 'See the memorial page for photos.'
    $g['memorialUrl'] = $s['memorial']; $g['searchUrl'] = $null; $g['note'] = $null
    $p['gravestone'] = $g
  }
  $src = New-Object System.Collections.ArrayList
  if ((Get- $s 'src') -eq 'mom') {
    $o = NewDict; $o['title'] = $momSource; $o['url'] = $null; [void]$src.Add($o)
  } elseif ($parents.Count) {
    $o = NewDict; $o['title'] = "Named as a child in the records of $($byId[$parents[0]]['name']) (see that person's sources)"; $o['url'] = $null; [void]$src.Add($o)
  }
  if ($s.ContainsKey('memorial')) {
    $o = NewDict; $o['title'] = $s['memorialTitle']; $o['url'] = $s['memorial']; [void]$src.Add($o)
  }
  $p['sources'] = $src
  if ($s.ContainsKey('oq')) { $p['openQuestions'] = $s['oq'] } else { $p['openQuestions'] = @() }
  $p['id'] = $id
  $p['name'] = $s['name']
  $p['generation'] = $s['gen']
  $p['line'] = $s['line']
  $p['relationship'] = $null
  [void]$people.Add($p)
  $byId[$id] = $p
}

# ---------- links ----------
foreach ($s in $specData['people']) {
  $id = $s['id']
  $p = $byId[$id]
  $aliases = ToList (Get- $s 'aliases')

  if ($p['parents'].Count) {
    foreach ($par in $p['parents']) { if (-not $byId[$par]) { throw "Unknown parent $par for $id" } }
    $pn = ($p['parents'] | ForEach-Object { $byId[$_]['name'] }) -join ' and '
    $word = switch ($p['sex']) { 'M' { 'Son' } 'F' { 'Daughter' } default { 'Child' } }
    $p['biography'] = ("$word of $pn. " + $p['biography']).Trim()
  }

  foreach ($par in $p['parents']) {
    $pp = $byId[$par]
    if (-not $pp) { throw "Unknown parent $par for $id" }
    $kids = ToList $pp['children']
    if (-not ($kids | Where-Object { $_.ContainsKey('id') -and $_['id'] -eq $id })) {
      $idx = -1
      for ($i = 0; $i -lt $kids.Count; $i++) {
        $k = $kids[$i]
        if (-not $k.ContainsKey('id') -and $aliases -contains $k['name']) { $idx = $i; break }
      }
      $ref = NewDict; $ref['id'] = $id
      if ($idx -ge 0) { $kids[$idx] = $ref } else { [void]$kids.Add($ref) }
    }
    $pp['children'] = $kids
  }

  # remove the name-only sibling strings from everyone sharing a parent
  if ($p['parents'].Count -and $aliases.Count) {
    foreach ($q in $people) {
      if ($q['id'] -eq $id -or -not $q.ContainsKey('parents')) { continue }
      $shared = @($q['parents'] | Where-Object { $p['parents'] -contains $_ })
      if (-not $shared.Count) { continue }
      if ($q.ContainsKey('siblings') -and $q['siblings']) {
        $q['siblings'] = @($q['siblings'] | Where-Object { $aliases -notcontains $_ })
      }
    }
  }

  # reverse spouse links
  foreach ($x in $p['spouses']) {
    if (-not $x.ContainsKey('id')) { continue }
    $o = $byId[$x['id']]
    $osp = New-Object System.Collections.ArrayList
    foreach ($y in (ToList $o['spouses'])) {
      # drop a name-only entry for this same spouse
      if (-not $y.ContainsKey('id') -and $aliases -contains $y['name']) { continue }
      [void]$osp.Add($y)
    }
    if (-not ($osp | Where-Object { $_.ContainsKey('id') -and $_['id'] -eq $id })) {
      $ref = NewDict; $ref['id'] = $id; [void]$osp.Add($ref)
    }
    $o['spouses'] = $osp
  }

  # "kids": existing people this new person is a parent of
  foreach ($kid in (ToList (Get- $s 'kids'))) {
    $k = $byId[$kid]
    $kp = ToList $k['parents']
    if ($kp -notcontains $id) { [void]$kp.Add($id) }
    $k['parents'] = $kp.ToArray()
    $mine = ToList $p['children']
    $ref = NewDict; $ref['id'] = $kid; [void]$mine.Add($ref)
    $p['children'] = $mine
  }
}

# children of new people whose parents are both new (e.g. jennifer-caudill) are handled above via parents.

# ---------- edits to existing ancestors ----------
foreach ($e in $specData['ancestorEdits']) {
  $p = $byId[$e['id']]
  if (-not $p) { throw "Unknown id $($e['id'])" }
  if ($e.ContainsKey('parents')) { $p['parents'] = $e['parents'] }
  if ($e.ContainsKey('set')) { foreach ($k in $e['set'].Keys) { $p[$k] = $e['set'][$k] } }
  if ($e.ContainsKey('appendBio')) { $p['biography'] = (([string]$p['biography']) + ' ' + $e['appendBio']).Trim() }
  if ($e.ContainsKey('addSiblings')) { $f = ToList $p['siblings']; foreach ($x in $e['addSiblings']) { [void]$f.Add($x) }; $p['siblings'] = $f }
  if ($e.ContainsKey('addSpouses')) { $f = ToList $p['spouses']; foreach ($x in $e['addSpouses']) { [void]$f.Add($x) }; $p['spouses'] = $f }
  if ($e.ContainsKey('addResidences')) { $f = ToList $p['residences']; foreach ($x in $e['addResidences']) { [void]$f.Add($x) }; $p['residences'] = $f }
  if ($e.ContainsKey('removeOpenQuestions')) { $p['openQuestions'] = @($p['openQuestions'] | Where-Object { $e['removeOpenQuestions'] -notcontains $_ }) }
  if ($e.ContainsKey('birth')) { $p['birth'] = $e['birth'] }
  if ($e.ContainsKey('death')) { $p['death'] = $e['death'] }
  if ($e.ContainsKey('addFacts')) { $f = ToList $p['facts']; foreach ($x in $e['addFacts']) { [void]$f.Add($x) }; $p['facts'] = $f }
  if ($e.ContainsKey('addSources')) { $f = ToList $p['sources']; foreach ($x in $e['addSources']) { [void]$f.Add($x) }; $p['sources'] = $f }
}

$d['people'] = $people
Write-JsonFile $d $Data
Write-Host "Added $($specData['people'].Count) people; now $($people.Count) total."
