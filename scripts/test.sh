#!/usr/bin/env bash
set -euo pipefail

echo "=== FoxCode: test ==="

# Glob-based discovery: run all test files (single source of truth)
node --test \
  foxcode/channel/*.test.mjs \
  foxcode/channel/launch/*.test.mjs \
  foxcode/extension/background/*.test.js \
  foxcode/extension/popup/*.test.js

echo "=== all tests passed ==="
