#!/usr/bin/env bash
set -euo pipefail

echo "=== FoxCode: test ==="

echo "--- Channel lib tests ---"
node --test foxcode/channel/lib.test.mjs

echo "--- Markdown tests ---"
node --test extension/sidebar/markdown.test.js

echo "=== all tests passed ==="
