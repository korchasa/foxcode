#!/usr/bin/env bash
set -euo pipefail

if [[ "${CLAUDECODE:-}" == "1" ]] || [[ "${NO_COLOR:-}" == "1" ]]; then
  export NO_COLOR=1
fi

echo "=== FoxCode: dev ==="

python3 foxcode/skills/foxcode-run-project-profile/scripts/launch_firefox.py
