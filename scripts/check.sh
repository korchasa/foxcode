#!/usr/bin/env bash
set -euo pipefail

# Auto-detect AI agent environment
if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== FoxCode: check ==="

# Comment scan
echo "--- Comment scan ---"
grep -rn "TODO\|FIXME\|HACK\|XXX\|debugger\|console\.log" \
  foxcode/extension/ \
  foxcode/channel/server.mjs foxcode/channel/lib.mjs \
  opencode/index.mjs opencode/lib opencode/bin opencode/prepack.mjs \
  2>/dev/null || echo "No issues found."

# Validate manifest.json
echo "--- Manifest validation ---"
if command -v jq &>/dev/null; then
  jq . foxcode/extension/manifest.json >/dev/null && echo "manifest.json: valid JSON"
else
  node -e "JSON.parse(require('fs').readFileSync('foxcode/extension/manifest.json','utf8'))" && echo "manifest.json: valid JSON"
fi

echo "--- Codex config validation ---"
if command -v codex &>/dev/null; then
  codex mcp get foxcode >/dev/null && echo ".codex/config.toml: foxcode MCP OK"
else
  echo "codex not found; skipped"
fi

# JS syntax check
echo "--- JS syntax check ---"
node --check foxcode/channel/server.mjs && echo "foxcode/channel/server.mjs: syntax OK"
node --check foxcode/channel/lib.mjs && echo "foxcode/channel/lib.mjs: syntax OK"
node --check opencode/index.mjs && echo "opencode/index.mjs: syntax OK"
node --check opencode/prepack.mjs && echo "opencode/prepack.mjs: syntax OK"
node --check opencode/bin/foxcode-opencode.mjs && echo "opencode/bin/foxcode-opencode.mjs: syntax OK"
for f in opencode/lib/*.mjs; do
  node --check "$f" && echo "$f: syntax OK"
done

# Tests — unit + acceptance (glob-based discovery)
echo "--- Tests ---"
node --test \
  foxcode/channel/*.test.mjs \
  foxcode/extension/background/*.test.js \
  foxcode/extension/popup/*.test.js \
  opencode/lib/*.test.mjs \
  opencode/test/*.test.mjs \
  scripts/ci-yml-publish.test.mjs \
  scripts/release-sh.test.mjs \
  scripts/test-npx-channel-mcp.test.mjs

# Acceptance: MCP-stdio protocol + WebSocket bridge end-to-end.
# Spawn the channel as a subprocess and exercise the full RPC path
# without requiring Firefox or OpenCode itself.
echo "--- Acceptance (Tier 1+2: MCP + bridge) ---"
node --test \
  opencode/test/acceptance/mcp.test.mjs \
  opencode/test/acceptance/bridge.test.mjs

# Tier 4 (real IDE × real Firefox) is not run by `check`. It lives in:
#   scripts/test-ide.sh         — IDEs drive evalInBrowser (LLM tokens, ~50 s)
#   scripts/test-ide-skill.sh   — OpenCode command skill launches Firefox (LLM tokens)

# Python tests (skill helpers)
echo "--- Python tests ---"
python3 -W ignore::ResourceWarning -m unittest discover \
  -s foxcode/skills/foxcode-run-project-profile/scripts \
  -p 'test_*.py'

# Opt-in: smoke-test the published foxcode-channel via npx.
# Off by default so the check pipeline does not depend on the npm registry.
if [[ "${FOXCODE_SMOKE:-0}" == "1" ]]; then
  echo "--- Smoke (npx channel) ---"
  bash "$(dirname "$0")/test-npx-channel.sh"
fi

echo "=== check complete ==="
