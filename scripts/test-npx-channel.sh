#!/usr/bin/env bash
# Smoke test: published foxcode-channel resolves via npx and
# returns the expected version. Uses an isolated HOME so the test runs
# against a clean npx cache.
#
# Usage:
#   scripts/test-npx-channel.sh [--print]
#
# --print prints the planned npx invocation without executing it (used by
# the unit test that verifies the script's structure).

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPT_DIR/.." && pwd)

VERSION="${FOXCODE_CHANNEL_VERSION:-$(node -e "
  process.stdout.write(
    JSON.parse(require('fs').readFileSync('$REPO/foxcode/channel/package.json','utf8')).version,
  )
")}"

SPEC="foxcode-channel@${VERSION}"
CMD=(npx -y "$SPEC" --version)

if [[ "${1:-}" == "--print" ]]; then
  printf 'Would run: %s\n' "${CMD[*]}"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "[smoke] resolving $SPEC via npx in isolated HOME=$TMP"
START=$(date +%s)
OUT=$(HOME="$TMP" npm_config_cache="$TMP/cache" "${CMD[@]}" 2>&1)
END=$(date +%s)
ELAPSED=$((END - START))

if [[ "$OUT" != *"$VERSION"* ]]; then
  echo "[smoke] FAIL: expected '$VERSION' in output, got: $OUT" >&2
  exit 1
fi

echo "[smoke] OK: version $VERSION returned in ${ELAPSED}s"
