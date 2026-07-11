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

PATH="$(dirname "$node"):/usr/bin:/bin" "$node" --input-type=module - "$node" "$resources/src/host.js" "$workspace" <<'JS'
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
const [node, host, cwd] = process.argv.slice(2);
const catalog = (await import(pathToFileURL(host))).loadModelCatalog({});
const model = catalog.models.find(({ available, provider, id }) => available && provider === "openai-codex" && id === "gpt-5.4-mini") ?? catalog.models.find(({ available }) => available);
if (!model) throw new Error("packaged smoke requires one configured real Pi model");
const child = spawn(node, [host], { stdio: ["pipe", "pipe", "inherit"] });
let buffer = ""; const waiting = new Map();
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => { buffer += chunk; for (;;) { const end = buffer.indexOf("\n"); if (end < 0) break; const event = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); if (["completed", "failed", "cancelled"].includes(event.type)) waiting.get(event.requestId)?.(event); } });
const send = (requestId, operation, payload) => new Promise((resolve) => { waiting.set(requestId, resolve); child.stdin.write(`${JSON.stringify({ version: 1, requestId, operation, payload })}\n`); });
try {
  const created = await send("create", "createThread", { cwd, provider: model.provider, modelId: model.id });
  if (created.type !== "completed") throw new Error(created.payload.message);
  const run = await send("run", "promptThread", { threadId: created.payload.threadId, prompt: "Reply exactly OK." });
  if (run.type !== "completed" || !run.payload.messages.some(({ role, text }) => role === "assistant" && text)) throw new Error(run.payload.message ?? "real prompt returned no answer");
  const reopened = await send("reopen", "openThread", { cwd, sessionFile: created.payload.sessionFile });
  if (reopened.type !== "completed" || !reopened.payload.messages.some(({ role, text }) => role === "assistant" && text)) throw new Error(reopened.payload.message ?? "transcript did not reopen");
} finally { child.kill(); }
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
