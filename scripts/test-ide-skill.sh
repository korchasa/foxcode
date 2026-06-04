#!/usr/bin/env bash
# Tier-4 skill acceptance: real OpenCode invokes the canonical
# foxcode-run-project-profile skill, launches Firefox, and drives DuckDuckGo
# through the FoxCode MCP browser tool. Costs LLM tokens.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== FoxCode: Tier-4 skill acceptance (OpenCode command skill) ==="

for bin in opencode node npx; do
  if ! command -v "$bin" &>/dev/null; then
    echo "Error: '$bin' not found on PATH. Skill acceptance requires opencode, node, npx." >&2
    exit 1
  fi
done

pid_file=".foxcode/web-ext.pid"
before_pid_state=""
if [[ -f "$pid_file" ]]; then
  before_pid_state="$(cat "$pid_file")"
fi

out="$(mktemp "${TMPDIR:-/tmp}/foxcode-opencode-skill.XXXXXX")"

cleanup() {
  local after_pid_state=""
  if [[ -f "$pid_file" ]]; then
    after_pid_state="$(cat "$pid_file")"
  fi
  if [[ -n "$after_pid_state" && "$after_pid_state" != "$before_pid_state" ]]; then
    local pid
    pid="$(head -n 1 "$pid_file" || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]]; then
      /bin/kill -TERM "-$pid" 2>/dev/null || /bin/kill -TERM "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$pid_file"
  fi
}
trap cleanup EXIT

prompt="$(cat <<'PROMPT'
After the foxcode-run-project-profile skill reports Ready, call foxcode evalInBrowser exactly once with this code and return only its JSON result, no markdown:
await api.navigate("https://duckduckgo.com/?q=foxcode");
await new Promise((resolve) => setTimeout(resolve, 3000));
return await api.eval(`(() => {
  const selectors = ["a[data-testid=\\"result-title-a\\"]", "a.result__a"];
  const anchors = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
  const results = [];
  const seen = new Set();
  for (const a of anchors) {
    const title = (a.innerText || a.textContent || "").trim().replace(/\\s+/g, " ");
    let url = a.href;
    try {
      const parsed = new URL(url);
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) url = decodeURIComponent(uddg);
    } catch (_) {}
    if (!title || !url || seen.has(url)) continue;
    if (url.includes("duckduckgo.com/y.js") || url.includes("duckduckgo.com/?q=")) continue;
    seen.add(url);
    results.push({ title, url });
  }
  return { third: results[2] || null, count: results.length, pageTitle: document.title, pageUrl: location.href };
})()`);
PROMPT
)"

set +e
opencode run \
  --format json \
  --dangerously-skip-permissions \
  --command foxcode-run-project-profile \
  "$prompt" | tee "$out"
status="${PIPESTATUS[0]}"
set -e

if [[ "$status" -ne 0 ]]; then
  echo "Error: OpenCode exited with status $status. Trace: $out" >&2
  exit "$status"
fi

node - "$out" <<'NODE'
const fs = require("node:fs");
const path = process.argv[2];
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
const events = [];
for (const line of lines) {
  try {
    events.push(JSON.parse(line));
  } catch {
    // OpenCode should emit JSONL, but ignore non-JSON noise defensively.
  }
}

function toolEvents(name) {
  return events.filter((event) => event.type === "tool_use" && event.part?.tool === name);
}

const statusCalls = toolEvents("foxcode_status");
const launchCalls = toolEvents("foxcode_launchBrowser");
const evalCalls = toolEvents("foxcode_evalInBrowser");
if (statusCalls.length < 1) throw new Error("Expected at least one foxcode_status call");
if (evalCalls.length !== 1) throw new Error(`Expected exactly one foxcode_evalInBrowser call, got ${evalCalls.length}`);

const launched = launchCalls.some((event) => {
  const raw = event.part?.state?.output || "{}";
  try {
    const parsed = JSON.parse(raw);
    return /^(connected|already-connected|already-running)$/.test(parsed.status || "");
  } catch {
    return false;
  }
});
const alreadyConnected = statusCalls.some((event) => {
  const raw = event.part?.state?.output || "{}";
  try {
    return JSON.parse(raw).connectedClients > 0;
  } catch {
    return false;
  }
});
if (!launched && !alreadyConnected) {
  throw new Error("Expected foxcode_launchBrowser to succeed or an already connected FoxCode client");
}

const rawEvalOutput = evalCalls[0].part?.state?.output;
if (!rawEvalOutput) throw new Error("evalInBrowser output is empty");
const result = JSON.parse(rawEvalOutput);
if (!result.third?.title || !result.third?.url) {
  throw new Error(`Missing third DuckDuckGo result: ${rawEvalOutput}`);
}
if (!/duckduckgo/i.test(result.pageTitle || "") && !/duckduckgo\.com/i.test(result.pageUrl || "")) {
  throw new Error(`Expected DuckDuckGo page metadata: ${rawEvalOutput}`);
}
if (result.count < 3) {
  throw new Error(`Expected at least 3 results, got ${result.count}`);
}
console.log(`OK: third result = ${JSON.stringify(result.third)}`);
NODE

echo "Trace: $out"
echo "=== Tier-4 skill acceptance complete ==="
