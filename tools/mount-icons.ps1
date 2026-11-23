# Looks up every mount in mounts.js on Wowhead's WoW Forever search and saves its item or spell ID,
# icon and quality to mount-icons.json (the Loot & Mounts page shows the icons and links the item).
# Run from the site folder:  powershell -ExecutionPolicy Bypass -File tools\mount-icons.ps1
$ErrorActionPreference = "Stop"
$site = Split-Path $PSScriptRoot -Parent
$src = Get-Content (Join-Path $site "mounts.js") -Raw
$names = [regex]::Matches($src, '(?m)^\s+\["([^"]+)", "[a-z ]+", "[AHB]"') | ForEach-Object { $_.Groups[1].Value }
# Names on the page that Wowhead knows by another name.
$search = @{
  "Summon Warhorse (Forsaken)" = "Summon Warhorse"
  "Blue, Green, Red and Yellow Qiraji Resonating Crystals" = "Blue Qiraji Resonating Crystal"
  "Swift Palomino" = "Swift Palomino"
  "Reins of the Winterspring Frostsaber" = "Winterspring Frostsaber"
}
$out = [ordered]@{}
foreach ($n in $names) {
  $q = if ($search.ContainsKey($n)) { $search[$n] } else { $n }
  try {
    $r = Invoke-RestMethod -Uri ("https://www.wowhead.com/forever/search/suggestions-template?q=" + [uri]::EscapeDataString($q)) -UserAgent "Mozilla/5.0 (guild site build script)"
    $all = @($r.results) | Where-Object { $_.icon }
    # Prefer the mount item with the exact name, then any mount item, then the mount spell.
    $hit = $all | Where-Object { $_.type -eq 3 -and $_.name -eq $q -and ($_.pinBreadcrumb -contains "Mount") } | Select-Object -First 1
    if (-not $hit) { $hit = $all | Where-Object { $_.type -eq 3 -and ($_.pinBreadcrumb -contains "Mount") } | Select-Object -First 1 }
    if (-not $hit) { $hit = $all | Where-Object { $_.type -eq 6 -and $_.name -eq $q } | Select-Object -First 1 }
    if (-not $hit) { $hit = $all | Where-Object { $_.type -eq 6 } | Select-Object -First 1 }
    if ($hit) {
      $out[$n] = [ordered]@{ t = $(if ($hit.type -eq 3) { "item" } else { "spell" }); id = $hit.id; icon = $hit.icon; q = $hit.quality }
      "{0,-55} {1} {2} {3}" -f $n, $out[$n].t, $hit.id, $hit.icon
    } else { "{0,-55} (not found)" -f $n }
  } catch { "{0,-55} (error: {1})" -f $n, $_.Exception.Message }
  Start-Sleep -Milliseconds 350
}
# Checked by hand: the search doesn't pick these correctly on its own.
$out["Black Qiraji Resonating Crystal"] = [ordered]@{ t = "item"; id = 21176; icon = "inv_misc_qirajicrystal_05"; q = 5 }
$out["Summon Warhorse"] = [ordered]@{ t = "spell"; id = 13819; icon = "spell_nature_swiftness"; q = $null } # the Alliance one; 1279399 is the Forsaken version
$json = $out | ConvertTo-Json -Depth 4 -Compress
[IO.File]::WriteAllText((Join-Path $site "mount-icons.json"), $json, (New-Object Text.UTF8Encoding $false))
"Saved $($out.Count) of $($names.Count) mounts to mount-icons.json"
