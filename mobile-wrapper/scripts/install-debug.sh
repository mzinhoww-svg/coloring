#!/usr/bin/env bash
# Installs the already-built debug APK on the running emulator/device and
# launches it, then reports whether the activity is in the foreground.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
PKG="com.aurimar.rabisco"

[[ -f "$APK" ]] || { echo "APK missing: $APK. Run scripts/build-debug.sh first." >&2; exit 1; }

"$ADB" install -r "$APK"
"$ADB" shell am force-stop "$PKG" || true
"$ADB" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 4
"$ADB" shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | head -3
"$ADB" shell pidof "$PKG" >/dev/null && echo "process running: $PKG"
