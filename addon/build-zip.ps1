# Builds downloads\BarkAndStone.zip with forward-slash paths (BarkAndStone/BarkAndStone.toc, ...),
# which every unzip tool and CurseForge read correctly. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File addon\build-zip.ps1
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$src = Join-Path $PSScriptRoot "BarkAndStone"
$out = Join-Path (Split-Path $PSScriptRoot -Parent) "downloads\BarkAndStone.zip"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
if (Test-Path $out) { Remove-Item $out -Force -Confirm:$false }
$zip = [System.IO.Compression.ZipFile]::Open($out, "Create")
try {
  Get-ChildItem $src -Recurse -File | ForEach-Object {
    $rel = "BarkAndStone/" + $_.FullName.Substring($src.Length + 1).Replace("\", "/")
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel)
  }
} finally { $zip.Dispose() }
"Built $out"
