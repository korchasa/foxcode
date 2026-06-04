#!/usr/bin/env bash
set -euo pipefail

if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== FoxCode: dev ==="

# Local dev: prefer the in-tree channel over npx so iteration on launch
# code reflects immediately. The channel resolves the Firefox extension
# from ./foxcode/channel/extension/ at publish time; in dev it points at
# ../extension/ relative to its own module URL — but that source dir is
# the canonical one, so dev mode just works after prepack has been run
# once (or via the auto-resolution to ../extension/).
exec node foxcode/channel/server.mjs --launch-foreground
