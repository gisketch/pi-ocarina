#!/usr/bin/env bash
set -euo pipefail

app="${1:-src-tauri/target/release/bundle/macos/Pi Ocarina.app}"
resources="$app/Contents/Resources/agent-host"
node="$resources/node_modules/node/bin/node"
executable="$app/Contents/MacOS/pi-ocarina"

test -x "$node"
test -x "$executable"
test -f "$resources/src/host.js"
test -f "$resources/node_modules/@mariozechner/pi-coding-agent/package.json"
if find "$app/Contents" -name auth.json -o -name settings.json | grep -q .; then
  echo "credential or settings file was copied into the app bundle" >&2
  exit 1
fi

workspace="$(mktemp -d)"
pid=""
cleanup() {
  test -z "$pid" || kill "$pid" 2>/dev/null || true
  rm -rf "$workspace"
}
trap cleanup EXIT
mkdir -p "$workspace/.pi/extensions"
printf 'export default function () {}\n' > "$workspace/.pi/extensions/packaged-proof.js"

PATH=/usr/bin:/bin "$node" --input-type=module - "$resources/src/host.js" "$workspace" <<'JS'
import { pathToFileURL } from "node:url";
const host = await import(pathToFileURL(process.argv[2]));
const result = await host.inspectRuntime({ cwd: process.argv[3] });
if (!result.extensions.some((path) => path.endsWith("packaged-proof.js")) || result.errors.length) process.exit(1);
const catalog = host.loadModelCatalog({});
if (catalog.errors.length) process.exit(1);
if (process.env.HOME && (await import("node:fs")).existsSync(`${process.env.HOME}/.pi/agent/auth.json`) && !catalog.providers.some((provider) => provider.configured)) process.exit(1);
JS

for launch in 1 2; do
  PATH=/usr/bin:/bin "$executable" >"$workspace/app.log" 2>&1 &
  pid=$!
  ready=""
  for _ in {1..40}; do
    child="$(pgrep -P "$pid" | head -1 || true)"
    if test -n "$child" && ps -p "$child" -o command= | grep -q "$node"; then ready=1; break; fi
    sleep 0.25
  done
  test -n "$ready" || break
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  pid=""
done

if test -n "${ready:-}" && test "$launch" = 2; then
  echo "packaged macOS app passed Finder-PATH launch and relaunch smoke"
  exit 0
fi

cat "$workspace/app.log" >&2
echo "packaged app did not start its bundled agent host on launch $launch" >&2
exit 1
