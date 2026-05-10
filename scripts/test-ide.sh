#!/usr/bin/env bash
# Tier-4 acceptance: real Claude Code + real OpenCode each drive the foxcode
# extension end-to-end against a real headless Firefox. Costs LLM tokens.
# No env-var gating — running this script means you want it.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== FoxCode: Tier-4 acceptance (Claude + OpenCode driving real Firefox) ==="

for bin in deno opencode claude python3 npx; do
  if ! command -v "$bin" &>/dev/null; then
    echo "Error: '$bin' not found on PATH. Tier-4 requires deno, opencode, claude, python3, npx." >&2
    exit 1
  fi
done

deno test -A --no-check opencode/test/acceptance/ide-task.test.ts

echo "=== Tier-4 complete ==="
