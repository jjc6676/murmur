#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

mkdir -p Frameworks Resources
stage=$(mktemp -d "${TMPDIR:-/tmp}/murmur-ios.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT

matches() {
    [[ -f "$1" ]] && [[ $(wc -c < "$1") -eq $2 ]] &&
        [[ $(shasum -a 256 "$1" | awk '{print $1}') == "$3" ]]
}

fetch() {
    local url=$1 dest=$2 bytes=$3 sha=$4
    if matches "$dest" "$bytes" "$sha"; then
        printf 'Verified cached %s\n' "$dest"
        return
    fi
    curl --fail --location --show-error --silent --retry 3 --proto '=https' --proto-redir '=https' \
        --output "$stage/download" "$url"
    if ! matches "$stage/download" "$bytes" "$sha"; then
        printf 'Refusing %s: expected %s bytes and SHA-256 %s\n' "$dest" "$bytes" "$sha" >&2
        exit 1
    fi
    mv -f "$stage/download" "$dest"
}

archive=Frameworks/whisper-b5907-xcframework.zip
fetch 'https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-b5907-xcframework.zip' \
    "$archive" 67242929 2482ad38f3c8f25a0521d284c9ad3e5838aaa812f57c936f32624b9b7b1bc36c
# ditto preserves the versioned framework symlinks in Apple's bundle layout.
ditto -x -k "$archive" "$stage"
framework="$stage/build-apple/whisper.xcframework"
test -f "$framework/Info.plist"
rm -rf Frameworks/whisper.xcframework
mv "$framework" Frameworks/whisper.xcframework

fetch 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en.bin' \
    Resources/ggml-base.en.bin 147964211 a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002
