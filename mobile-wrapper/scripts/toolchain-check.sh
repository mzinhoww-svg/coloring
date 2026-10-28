#!/usr/bin/env bash
# Reports the Android toolchain available to this wrapper.
# Read-only: does not build, install, or modify anything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DEFAULT="$HOME/Library/Android/sdk"
export ANDROID_HOME="${ANDROID_HOME:-$SDK_DEFAULT}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

# Prefer a JDK that Gradle/AGP support. Android Studio ships one.
if [[ -z "${JAVA_HOME:-}" ]]; then
  # AGP 8.13 supports JDK 17-21; the Android Studio JBR (25) is too new.
  for candidate in \
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"; do
    if [[ -x "$candidate/bin/java" ]]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi

echo "== wrapper =="
echo "root:        $ROOT"
echo "JAVA_HOME:   ${JAVA_HOME:-<unset>}"
echo "ANDROID_HOME:${ANDROID_HOME}"
[[ -x "${JAVA_HOME:-/nonexistent}/bin/java" ]] && "$JAVA_HOME/bin/java" -version 2>&1 | sed 's/^/java:        /'
echo
echo "== SDK =="
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [[ -d "$ANDROID_HOME" ]]; then
  echo "platforms:   $(ls "$ANDROID_HOME/platforms" 2>/dev/null | tr '\n' ' ')"
  echo "build-tools: $(ls "$ANDROID_HOME/build-tools" 2>/dev/null | tr '\n' ' ')"
  echo "emulators:   $("$ANDROID_HOME/emulator/emulator" -list-avds 2>/dev/null | tr '\n' ' ')"
else
  echo "SDK not found at $ANDROID_HOME" >&2
fi
echo
echo "== devices =="
"$ANDROID_HOME/platform-tools/adb" devices -l 2>/dev/null || true
echo
echo "== gradle wrapper =="
if [[ -f "$ROOT/android/gradlew" ]]; then
  (cd "$ROOT/android" && ./gradlew --version 2>&1 | sed -n '1,12p')
else
  echo "android/ not generated yet"
fi
