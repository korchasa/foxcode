#!/usr/bin/env bash
set -euo pipefail

# Auto-detect AI agent environment
if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== Fire Claude: check ==="

# Comment scan
echo "--- Comment scan ---"
grep -rn "TODO\|FIXME\|HACK\|XXX\|debugger\|console\.log" extension/ channel/server.mjs channel/lib.mjs 2>/dev/null || echo "No issues found."

# Validate manifest.json
echo "--- Manifest validation ---"
if command -v jq &>/dev/null; then
  jq . extension/manifest.json >/dev/null && echo "manifest.json: valid JSON"
else
  node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))" && echo "manifest.json: valid JSON"
fi

# JS syntax check
echo "--- JS syntax check ---"
node --check channel/server.mjs && echo "channel/server.mjs: syntax OK"
node --check channel/lib.mjs && echo "channel/lib.mjs: syntax OK"

# Tests
echo "--- Tests ---"
node --test channel/lib.test.mjs
node --test extension/sidebar/markdown.test.js

echo "=== check complete ==="
