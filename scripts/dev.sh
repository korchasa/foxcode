#!/usr/bin/env bash
set -euo pipefail

if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== Fire Claude: dev ==="

if command -v web-ext &>/dev/null; then
  web-ext run --source-dir extension/
else
  echo "web-ext not found. Install with: npm install -g web-ext"
  echo "Manual: open Firefox → about:debugging → This Firefox → Load Temporary Add-on → extension/manifest.json"
  exit 1
fi
