#!/usr/bin/env bash
# FoxCode release helper — LOCAL PREVIEW ONLY.
#
# The real release runs in CI (.github/workflows/ci.yml `auto-release` job):
# on each push to main with conventional-commit prefixes feat/fix/perf/refactor/
# build, the workflow bumps the lockstep file-set, tags `vX.Y.Z`, publishes
# `foxcode-channel` to npm via NPM_TOKEN, and creates a GitHub Release.
#
# This script reproduces the same bump locally so an operator can preview the
# diff before pushing. It does NOT commit, tag, or publish.
#
# Usage:
#   scripts/release.sh [--dry-run] X.Y.Z[-prerelease]
#
# --dry-run prints the planned edits without touching any file.
#
# Lockstep file-set (must match ci.yml::auto-release::Bump version and tag):
#   foxcode/extension/manifest.json
#   foxcode/.claude-plugin/plugin.json
#   foxcode/channel/package.json
#   foxcode/channel/package-lock.json   (.version + .packages[""].version)
#   opencode/package.json
#   foxcode/.mcp.json                   (foxcode-channel@<old> pin → <new>)

set -euo pipefail

DRY_RUN=0
NEW_VERSION=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,22p' "$0"
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

# SemVer validation (loose: major.minor.patch with optional -prerelease.X).
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "release.sh: invalid SemVer: $NEW_VERSION" >&2
  exit 64
fi

# Resolve repo root (script lives in <repo>/scripts/).
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO"

# Files where .version is the only field rewritten.
FILES=(
  foxcode/extension/manifest.json
  foxcode/.claude-plugin/plugin.json
  foxcode/channel/package.json
  opencode/package.json
)

echo "FoxCode release preview → ${NEW_VERSION}"
echo "(local preview; the real release is performed by CI on push to main.)"
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
    node -e "
      const fs = require('fs');
      const path = '$rel';
      const j = JSON.parse(fs.readFileSync(path, 'utf8'));
      j.version = '$NEW_VERSION';
      fs.writeFileSync(path, JSON.stringify(j, null, 2) + '\n');
    "
  fi
done

# package-lock.json needs both .version and .packages[""].version.
LOCK="foxcode/channel/package-lock.json"
if [[ -f "$LOCK" ]]; then
  OLD_LOCK_VERSION=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$LOCK','utf8')).version)")
  echo "  ${LOCK}: ${OLD_LOCK_VERSION} → ${NEW_VERSION}"
  if [[ $DRY_RUN -eq 0 ]]; then
    node -e "
      const fs = require('fs');
      const p = '$LOCK';
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      j.version = '$NEW_VERSION';
      if (j.packages && j.packages['']) j.packages[''].version = '$NEW_VERSION';
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    "
  fi
fi

# Pin literal: foxcode-channel@<old> → foxcode-channel@<new> in CC plugin .mcp.json.
MCP="foxcode/.mcp.json"
if [[ -f "$MCP" ]] && grep -q 'foxcode-channel@' "$MCP"; then
  OLD_PIN=$(grep -oE 'foxcode-channel@[0-9A-Za-z.\-]+' "$MCP" | head -1)
  NEW_PIN="foxcode-channel@${NEW_VERSION}"
  echo "  ${MCP}: ${OLD_PIN} → ${NEW_PIN}"
  if [[ $DRY_RUN -eq 0 ]]; then
    node -e "
      const fs = require('fs');
      const p = '$MCP';
      const src = fs.readFileSync(p, 'utf8');
      const re = /foxcode-channel@[0-9A-Za-z.\-]+/g;
      fs.writeFileSync(p, src.replace(re, '$NEW_PIN'));
    "
  fi
fi

echo
echo "Next steps:"
echo "  1. Inspect the diff:    git diff"
echo "  2. Commit + push:       git commit -am 'feat: …' && git push origin main"
echo "  3. CI auto-release:     .github/workflows/ci.yml bumps the same files, tags v${NEW_VERSION},"
echo "                          publishes foxcode-channel to npm, and creates the GitHub Release."
