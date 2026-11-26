$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$toolchain = Join-Path $root '.toolchain'
$keytool = Join-Path $toolchain 'jdk/bin/keytool.exe'
$store = Join-Path $toolchain 'release.jks'
$properties = Join-Path $root 'keystore.properties'
if ((Test-Path -LiteralPath $store) -or (Test-Path -LiteralPath $properties)) {
    throw 'A keystore or keystore.properties already exists. Restore its matching file instead of replacing the release key.'
}
if (!(Test-Path -LiteralPath $keytool -PathType Leaf)) {
    throw "Bundled JDK keytool not found at $keytool."
}

$id = [guid]::NewGuid().ToString('N')
$stage = Join-Path $toolchain ".key-stage-$id"
$passwordEnv = "MURMUR_KEY_PASSWORD_$id"
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }
    $password = [Convert]::ToBase64String($bytes)
    [Environment]::SetEnvironmentVariable($passwordEnv, $password, 'Process')
    $stagedStore = Join-Path $stage 'release.jks'
    & $keytool -genkeypair -noprompt -alias murmur -keyalg RSA -keysize 3072 -validity 10000 `
        -dname 'CN=Murmur Android' -storetype JKS -keystore $stagedStore `
        -storepass:env $passwordEnv -keypass:env $passwordEnv
    if ($LASTEXITCODE -ne 0) {
        throw "keytool failed (exit $LASTEXITCODE); no release key was installed."
    }
    $stagedProperties = Join-Path $stage 'keystore.properties'
    [IO.File]::WriteAllLines($stagedProperties, [string[]]@(
        'storeFile=.toolchain/release.jks'
        "storePassword=$password"
        'keyAlias=murmur'
        "keyPassword=$password"
    ), [Text.Encoding]::ASCII)

    # Move without overwrite, even when two invocations race.
    [IO.File]::Move($stagedStore, $store)
    try {
        [IO.File]::Move($stagedProperties, $properties)
    } catch {
        [IO.File]::Delete($store)
        throw
    }
    Write-Host 'Release key created. Back up .toolchain/release.jks and keystore.properties together in secure storage.'
} finally {
    [Environment]::SetEnvironmentVariable($passwordEnv, $null, 'Process')
    Remove-Item -LiteralPath $stage -Recurse -Force
}
