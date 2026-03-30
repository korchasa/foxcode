#!/usr/bin/env bash
set -euo pipefail

if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== FoxCode: dev ==="

if command -v web-ext &>/dev/null; then
  PORT_FILE="$HOME/.foxcode/port"
  START_URL_ARGS=""
  if [ -f "$PORT_FILE" ]; then
    WS_PORT=$(cat "$PORT_FILE")
    URL="http://localhost:$WS_PORT"
    PASSWORD_FILE="$HOME/.foxcode/password"
    if [ -f "$PASSWORD_FILE" ]; then
      WS_PASS=$(cat "$PASSWORD_FILE")
      URL="$URL#$WS_PORT:$WS_PASS"
    fi
    START_URL_ARGS="--start-url $URL"
  fi
  web-ext run --source-dir extension/ $START_URL_ARGS
else
  echo "web-ext not found. Install with: npm install -g web-ext"
  echo "Manual: open Firefox -> about:debugging -> This Firefox -> Load Temporary Add-on -> extension/manifest.json"
  exit 1
fi
