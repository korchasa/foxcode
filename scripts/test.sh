#!/usr/bin/env bash
set -euo pipefail

echo "=== FoxCode: test ==="

# Glob-based discovery: run all test files (single source of truth)
node --test \
  foxcode/channel/*.test.mjs \
  extension/background/*.test.js \
  extension/sidebar/*.test.js

echo "=== all tests passed ==="
