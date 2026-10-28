#!/usr/bin/env bash
# Copies the tested debug APK to the private delivery folder with checksums.
# Run only after the web fix is accepted and scripts/install-debug.sh passed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT_DIR:-$(cd "$ROOT/.." && pwd)/.private/android}"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

[[ -f "$APK" ]] || { echo "APK missing: $APK" >&2; exit 1; }
mkdir -p "$OUT"
cp "$APK" "$OUT/rabisco-debug.apk"
(cd "$OUT" && shasum -a 256 rabisco-debug.apk > rabisco-debug.apk.sha256)
echo "delivered: $OUT/rabisco-debug.apk"
cat "$OUT/rabisco-debug.apk.sha256"
