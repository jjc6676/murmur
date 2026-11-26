$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$toolchain = Join-Path $root '.toolchain'
$dest = Join-Path $toolchain 'whisper.cpp'
# ggml-org/whisper.cpp tag b5907.
$commit = '5eaee0cc9024eb9e9a99469199920c8b7f5cb9ec'
$sha256 = '2779bca626cadd18674fdd41ffa73e4fbf2dd90df5977d96fd36c97c1c9b68c9'
$expectedRoot = "whisper.cpp-$commit"
$url = "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/$commit"

New-Item -ItemType Directory -Path $toolchain -Force | Out-Null
$stage = Join-Path $toolchain ('.whisper-stage-' + [guid]::NewGuid().ToString('N'))
$backup = "$stage.previous"
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $archive = Join-Path $stage 'source.tar.gz'
    $extract = Join-Path $stage 'source'
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing -TimeoutSec 180
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $sha256) {
        throw "SHA-256 mismatch for whisper.cpp $commit; leaving the installed dependency unchanged."
    }

    New-Item -ItemType Directory -Path $extract | Out-Null
    & tar -xzf $archive -C $extract
    if ($LASTEXITCODE -ne 0) {
        throw "tar failed to extract whisper.cpp (exit $LASTEXITCODE)."
    }
    $entries = @(Get-ChildItem -LiteralPath $extract -Force)
    if ($entries.Count -ne 1 -or !$entries[0].PSIsContainer -or $entries[0].Name -cne $expectedRoot) {
        throw "Expected the archive to contain exactly one root directory: $expectedRoot."
    }

    $hadPrevious = [IO.Directory]::Exists($dest)
    if ($hadPrevious) {
        [IO.Directory]::Move($dest, $backup)
    }
    try {
        [IO.Directory]::Move($entries[0].FullName, $dest)
    } catch {
        if ($hadPrevious) {
            try {
                [IO.Directory]::Move($backup, $dest)
            } catch {
                throw "Could not restore whisper.cpp at $dest. The previous copy is preserved at $backup. $_"
            }
        }
        throw
    }
    if ($hadPrevious) {
        Remove-Item -LiteralPath $backup -Recurse -Force
    }
    Write-Host "Installed whisper.cpp b5907 ($commit) at $dest"
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
