#!/usr/bin/env bash
set -euo pipefail

# Auto-detect AI agent environment
if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== FoxCode: check ==="

# Comment scan
echo "--- Comment scan ---"
grep -rn "TODO\|FIXME\|HACK\|XXX\|debugger\|console\.log" extension/ foxcode/channel/server.mjs foxcode/channel/lib.mjs 2>/dev/null || echo "No issues found."

# Validate manifest.json
echo "--- Manifest validation ---"
if command -v jq &>/dev/null; then
  jq . extension/manifest.json >/dev/null && echo "manifest.json: valid JSON"
else
  node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))" && echo "manifest.json: valid JSON"
fi

# JS syntax check
echo "--- JS syntax check ---"
node --check foxcode/channel/server.mjs && echo "foxcode/channel/server.mjs: syntax OK"
node --check foxcode/channel/lib.mjs && echo "foxcode/channel/lib.mjs: syntax OK"

# Tests (glob-based discovery)
echo "--- Tests ---"
node --test \
  foxcode/channel/*.test.mjs \
  extension/background/*.test.js \
  extension/popup/*.test.js

echo "=== check complete ==="
