#!/usr/bin/env bash
# Runs the Maestro flows on a fresh iOS simulator: boots it, installs the
# dev build (.app or .tar.gz from `eas build --profile development-simulator`),
# starts Metro, builds the bundle once, then runs each flow.
# Usage, from the repo root: apps/mobile/.maestro/run-ios.sh <app.tar.gz|App.app> [out-dir]
set -uo pipefail
APP_IN="$1"
OUT="${2:-/tmp/maestro-out}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
mkdir -p "$OUT"
export PATH="$PATH:$HOME/.maestro/bin" MAESTRO_CLI_NO_ANALYTICS=1

SIM=$(xcrun simctl list devices available | grep -E "iPhone [0-9]+ \(" | head -1 | sed -E 's/.*\(([0-9A-F-]+)\).*/\1/')
echo "simulator $SIM"
xcrun simctl boot "$SIM" 2>/dev/null
xcrun simctl bootstatus "$SIM" -b >/dev/null

APP="$APP_IN"
if [[ "$APP_IN" == *.tar.gz ]]; then
  mkdir -p "$OUT/app" && tar -xzf "$APP_IN" -C "$OUT/app"
  APP=$(find "$OUT/app" -maxdepth 2 -name "*.app" | head -1)
fi
xcrun simctl install "$SIM" "$APP"

command -v maestro >/dev/null || curl -fsSL "https://get.maestro.mobile.dev" | bash >/dev/null

cd "$ROOT/apps/mobile"
CI=1 EXPO_NO_TELEMETRY=1 npx expo start --dev-client --port 8081 > "$OUT/metro.log" 2>&1 &
METRO_PID=$!
# Stop Metro when the script ends, also on an error or Ctrl-C.
trap 'kill "$METRO_PID" 2>/dev/null' EXIT
until curl -s http://localhost:8081/status | grep -q running; do sleep 1; done
BUNDLE=$(curl -s -H "expo-platform: ios" -H "accept: application/expo+json,application/json" http://localhost:8081 \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['launchAsset']['url'])")
curl -s -o /dev/null "$BUNDLE"
echo "metro ready"

status=0
for flow in fast-forward fast-forward-stop; do
  (cd "$OUT" && maestro test --device "$SIM" --test-output-dir="$OUT/$flow" "$ROOT/apps/mobile/.maestro/$flow.yaml") \
    > "$OUT/$flow.log" 2>&1
  code=$?
  echo "$flow exit $code"
  [ $code -eq 0 ] || status=1
done
echo "ALL_DONE status $status"
exit $status
