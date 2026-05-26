#!/usr/bin/env bash
# FoxCode release helper.
#
# Bumps the SemVer in three lock-stepped files and prints the follow-up
# commands the user must run by hand (npm publish + git tag).
#
# Usage:
#   scripts/release.sh [--dry-run] X.Y.Z[-prerelease]
#
# --dry-run prints the planned edits without touching any file.
#
# Files updated:
#   foxcode/.claude-plugin/plugin.json
#   foxcode/channel/package.json
#   opencode/package.json
# Forward-compat: if foxcode/.mcp.json contains a pinned
# `@korchasa/foxcode-channel@<old>` literal, that literal is bumped too.

set -euo pipefail

DRY_RUN=0
NEW_VERSION=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      if [[ -n "$NEW_VERSION" ]]; then
        echo "release.sh: unexpected extra argument: $arg" >&2
        exit 64
      fi
      NEW_VERSION="$arg"
      ;;
  esac
done

if [[ -z "$NEW_VERSION" ]]; then
  echo "release.sh: missing version argument (X.Y.Z[-prerelease])" >&2
  exit 64
fi

# SemVer validation (loose: major.minor.patch with optional -prerelease.X)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "release.sh: invalid SemVer: $NEW_VERSION" >&2
  exit 64
fi

# Resolve repo root (script lives in <repo>/scripts/)
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO"

FILES=(
  foxcode/.claude-plugin/plugin.json
  foxcode/channel/package.json
  opencode/package.json
)

echo "FoxCode release → ${NEW_VERSION}"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "(dry-run: no files will be modified)"
fi
echo

for rel in "${FILES[@]}"; do
  if [[ ! -f "$rel" ]]; then
    echo "release.sh: missing file: $rel" >&2
    exit 1
  fi
  OLD_VERSION=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$rel','utf8')).version)")
  echo "  ${rel}: ${OLD_VERSION} → ${NEW_VERSION}"
  if [[ $DRY_RUN -eq 0 ]]; then
    # node-based edit preserves JSON formatting via a 2-space pretty print.
    node -e "
      const fs = require('fs');
      const path = '$rel';
      const j = JSON.parse(fs.readFileSync(path, 'utf8'));
      j.version = '$NEW_VERSION';
      fs.writeFileSync(path, JSON.stringify(j, null, 2) + '\n');
    "
  fi
done

# Optional: bump pinned @korchasa/foxcode-channel@X.Y.Z literal in .mcp.json
MCP="foxcode/.mcp.json"
if [[ -f "$MCP" ]] && grep -q '@korchasa/foxcode-channel@' "$MCP"; then
  OLD_PIN=$(grep -oE '@korchasa/foxcode-channel@[0-9A-Za-z.\-]+' "$MCP" | head -1)
  NEW_PIN="@korchasa/foxcode-channel@${NEW_VERSION}"
  echo "  ${MCP}: ${OLD_PIN} → ${NEW_PIN}"
  if [[ $DRY_RUN -eq 0 ]]; then
    # Use node for safe in-place rewrite (avoids sed -i portability issues).
    node -e "
      const fs = require('fs');
      const p = '$MCP';
      const src = fs.readFileSync(p, 'utf8');
      const re = /@korchasa\/foxcode-channel@[0-9A-Za-z.\-]+/g;
      fs.writeFileSync(p, src.replace(re, '$NEW_PIN'));
    "
  fi
fi

echo
echo "Next steps (run by hand when ready):"
echo "  1. Inspect the diff: git diff -- ${FILES[*]} ${MCP}"
echo "  2. Publish channel:  (cd foxcode/channel && npm publish)"
echo "  3. Commit + tag:     git commit -am 'chore(release): v${NEW_VERSION}' && git tag v${NEW_VERSION}"
echo "  4. Push:             git push origin HEAD --tags"
