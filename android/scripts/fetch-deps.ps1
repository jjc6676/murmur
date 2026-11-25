$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root '.toolchain/whisper.cpp'
$tmp = Join-Path $env:TEMP 'whisper-b5907.tar.gz'
Invoke-WebRequest 'https://github.com/ggerganov/whisper.cpp/archive/b5907.tar.gz' -OutFile $tmp
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item (Split-Path $dest) -ItemType Directory -Force | Out-Null
tar -xzf $tmp -C (Split-Path $dest)
$folder = Get-ChildItem (Split-Path $dest) -Directory | Where-Object Name -Like 'whisper.cpp-*' | Select-Object -First 1
Move-Item $folder.FullName $dest
Remove-Item $tmp
Write-Host "whisper.cpp b5907 installed at $dest"
