#!/usr/bin/env bash
# Builds the web app, verifies the offline bundle, syncs it into the native
# project, and assembles a debug APK. Never installs or publishes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
if [[ -z "${JAVA_HOME:-}" ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
fi

npm run sync
(cd android && ./gradlew assembleDebug)

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo
echo "debug APK: $APK"
shasum -a 256 "$APK"
